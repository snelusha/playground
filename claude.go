package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

// FileNode and DirNode are distinct types that both satisfy Node via their
// MarshalJSON methods, eliminating the stringly-typed union anti-pattern.

type Node interface{ node() }

type FileNode struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

type DirNode struct {
	Name     string `json:"name"`
	Children []Node `json:"children"`
}

func (FileNode) node() {}
func (DirNode) node()  {}

// marshalableNode is a thin envelope used only during JSON encoding so that
// the "kind" discriminator is always written without polluting the domain types.
type marshalableNode struct {
	Kind     string  `json:"kind"`
	Name     string  `json:"name"`
	Content  *string `json:"content,omitempty"`
	Children *[]Node `json:"children,omitempty"`
}

func marshalNode(n Node) ([]byte, error) {
	switch v := n.(type) {
	case FileNode:
		return json.Marshal(marshalableNode{Kind: "file", Name: v.Name, Content: &v.Content})
	case DirNode:
		children := v.Children
		if children == nil {
			children = []Node{}
		}
		return json.Marshal(marshalableNode{Kind: "dir", Name: v.Name, Children: &children})
	default:
		return nil, fmt.Errorf("unknown node type %T", n)
	}
}

// nodeList is a named []Node so we can attach a custom MarshalJSON that
// delegates to marshalNode for each element.
type nodeList []Node

func (nl nodeList) MarshalJSON() ([]byte, error) {
	out := make([]json.RawMessage, len(nl))
	for i, n := range nl {
		b, err := marshalNode(n)
		if err != nil {
			return nil, err
		}
		out[i] = b
	}
	return json.Marshal(out)
}

// ---------------------------------------------------------------------------
// File-system traversal
// ---------------------------------------------------------------------------

var allowedExtensions = map[string]bool{
	".bal":  true,
	".toml": true,
}

func isAllowed(name string) bool {
	return allowedExtensions[strings.ToLower(filepath.Ext(name))]
}

// buildNodes recursively collects allowed files and non-empty sub-directories
// under dir, returning them sorted (dirs first, then files, each group alpha).
func buildNodes(dir string) ([]Node, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	dirs, files := partition(entries)
	sort.Slice(dirs, func(i, j int) bool { return dirs[i].Name() < dirs[j].Name() })
	sort.Slice(files, func(i, j int) bool { return files[i].Name() < files[j].Name() })

	var nodes []Node

	for _, e := range dirs {
		children, err := buildNodes(filepath.Join(dir, e.Name()))
		if err != nil {
			return nil, err
		}
		if len(children) == 0 {
			continue // skip empty directories
		}
		nodes = append(nodes, DirNode{Name: e.Name(), Children: children})
	}

	for _, e := range files {
		content, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			return nil, err
		}
		nodes = append(nodes, FileNode{Name: e.Name(), Content: string(content)})
	}

	return nodes, nil
}

// partition splits directory entries into subdirectories and allowed regular files.
func partition(entries []os.DirEntry) (dirs, files []os.DirEntry) {
	for _, e := range entries {
		switch {
		case e.IsDir():
			dirs = append(dirs, e)
		case e.Type().IsRegular() && isAllowed(e.Name()):
			files = append(files, e)
		}
	}
	return
}

// ---------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------

func validateInputDir(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("stat input_dir: %w", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("input_dir is not a directory: %s", path)
	}
	return nil
}

func writeJSON(path string, nodes nodeList) error {
	if dir := filepath.Dir(path); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}

	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()

	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	return enc.Encode(nodes)
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

func run(args []string) error {
	if len(args) != 2 {
		flag.Usage()
		return fmt.Errorf("expected 2 arguments, got %d", len(args))
	}

	inputDir, outputPath := args[0], args[1]

	if err := validateInputDir(inputDir); err != nil {
		return err
	}

	nodes, err := buildNodes(inputDir)
	if err != nil {
		return fmt.Errorf("build nodes: %w", err)
	}

	if err := writeJSON(outputPath, nodeList(nodes)); err != nil {
		return fmt.Errorf("write json: %w", err)
	}

	return nil
}

func main() {
	flag.CommandLine.SetOutput(os.Stderr)
	flag.Usage = func() {
		fmt.Fprintf(
			os.Stderr,
			"Usage: %s <input_dir> <output_json>\n\nGenerates a FileNode[] JSON array from the direct children of <input_dir>.\nOnly includes .bal and .toml files; skips empty directories.\n",
			filepath.Base(os.Args[0]),
		)
		flag.PrintDefaults()
	}
	flag.Parse()

	if err := run(flag.Args()); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
