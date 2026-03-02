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

func main() {
	flag.Usage = func() {
		_, _ = fmt.Fprintf(
			flag.CommandLine.Output(),
			"Usage: %s <input_dir> <output_json>\n\nGenerates a FileNode[] JSON array from the direct children of <input_dir>.\n",
			filepath.Base(os.Args[0]),
		)
		flag.PrintDefaults()
	}
	flag.Parse()

	args := flag.Args()
	if len(args) != 2 {
		flag.Usage()
		os.Exit(2)
	}

	inputDir := args[0]
	outputPath := args[1]

	if err := validateInputDir(inputDir); err != nil {
		fatalf("%v", err)
	}

	nodes, err := buildNodes(inputDir)
	if err != nil {
		fatalf("build: %v", err)
	}

	if err := writeJSON(outputPath, nodes); err != nil {
		fatalf("write: %v", err)
	}
}

func buildNodes(dir string) ([]any, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	type item struct {
		name string
		dir  bool
	}

	dirs := make([]item, 0, len(entries))
	files := make([]item, 0, len(entries))

	for _, e := range entries {
		name := e.Name()

		switch {
		case e.IsDir():
			dirs = append(dirs, item{name: name, dir: true})
		case e.Type().IsRegular() && isAllowedFileName(name):
			files = append(files, item{name: name, dir: false})
		}
	}

	sort.Slice(dirs, func(i, j int) bool { return dirs[i].name < dirs[j].name })
	sort.Slice(files, func(i, j int) bool { return files[i].name < files[j].name })

	nodes := make([]any, 0, len(dirs)+len(files))

	for _, d := range dirs {
		full := filepath.Join(dir, d.name)
		children, err := buildNodes(full)
		if err != nil {
			return nil, err
		}
		if len(children) == 0 {
			continue
		}
		nodes = append(nodes, map[string]any{
			"kind":     "dir",
			"name":     d.name,
			"children": children,
		})
	}

	for _, f := range files {
		full := filepath.Join(dir, f.name)
		contentBytes, err := os.ReadFile(full)
		if err != nil {
			return nil, err
		}
		nodes = append(nodes, map[string]any{
			"kind":    "file",
			"name":    f.name,
			"content": string(contentBytes),
		})
	}

	return nodes, nil
}

func isAllowedFileName(name string) bool {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".bal", ".toml":
		return true
	default:
		return false
	}
}

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

func writeJSON(path string, v any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()

	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	return enc.Encode(v)
}

func fatalf(format string, args ...any) {
	_, _ = fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
