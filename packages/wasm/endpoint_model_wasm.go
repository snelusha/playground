// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

package main

import (
	blangast "ballerina-lang-go/ast"
	"ballerina-lang-go/context"
	"ballerina-lang-go/projects"
	"syscall/js"
)

func getServiceModel(_ js.Value, args []js.Value) any {
	return newPromise(func(resolve js.Value, _ js.Value) {
		defer func() {
			if r := recover(); r != nil {
				resolve.Invoke(emptyServiceModel())
			}
		}()

		if len(args) < 2 {
			resolve.Invoke(emptyServiceModel())
			return
		}

		proxy := args[0]
		path := args[1].String()
		fsys := NewBridgeFS(proxy)

		result, err := projects.Load(fsys, path)
		if err != nil || result.Diagnostics().HasErrors() {
			resolve.Invoke(emptyServiceModel())
			return
		}

		project := result.Project()
		model := map[string]any{
			"services":        []any{},
			"resourceClasses": []any{},
			"endpoints":       []any{},
		}
		services := []any{}
		resourceClasses := []any{}
		endpoints := []any{}

		for _, module := range project.CurrentPackage().Modules() {
			cx := context.NewCompilerContext(context.NewCompilerEnvironment(project.Environment().TypeEnv(), false))
			for _, docID := range module.DocumentIDs() {
				doc := module.Document(docID)
				if doc == nil {
					continue
				}

				syntaxTree := doc.SyntaxTree()
				cx.DiagnosticEnv().RegisterFile(syntaxTree.FilePath(), doc.TextDocument())
				cu := blangast.GetCompilationUnit(cx, syntaxTree)
				for _, node := range cu.TopLevelNodes {
					switch n := node.(type) {
					case *blangast.BLangService:
						service := mapService(n)
						services = append(services, service)
						endpoints = append(endpoints, service["resources"].([]any)...)
					case *blangast.BLangClassDefinition:
						if len(n.ResourceMethods) == 0 {
							continue
						}
						classModel := mapResourceClass(n)
						resourceClasses = append(resourceClasses, classModel)
						endpoints = append(endpoints, classModel["resources"].([]any)...)
					}
				}
			}
		}

		model["services"] = services
		model["resourceClasses"] = resourceClasses
		model["endpoints"] = endpoints
		resolve.Invoke(model)
	})
}

func emptyServiceModel() map[string]any {
	return map[string]any{
		"services":        []any{},
		"resourceClasses": []any{},
		"endpoints":       []any{},
	}
}

func mapService(service *blangast.BLangService) map[string]any {
	basePath := serviceBasePath(service)
	resources := make([]any, 0, len(service.ResourceMethods))
	for _, method := range service.ResourceMethods {
		resources = append(resources, mapResourceMethod("", basePath, method))
	}

	return map[string]any{
		"basePath":          basePath,
		"attachPointLiteral": literalString(service.AttachPointLiteral),
		"listeners":         expressionStrings(service.AttachedExprs),
		"resources":         resources,
	}
}

func mapResourceClass(class *blangast.BLangClassDefinition) map[string]any {
	resources := make([]any, 0, len(class.ResourceMethods))
	for _, method := range class.ResourceMethods {
		resources = append(resources, mapResourceMethod(class.Name.Value, "", method))
	}

	return map[string]any{
		"name":      class.Name.Value,
		"resources": resources,
	}
}

func mapResourceMethod(owner, basePath string, method *blangast.BLangResourceMethod) map[string]any {
	segments, pathParams, relativePath := mapResourcePath(method.ResourcePath)
	path := joinResourcePaths(basePath, relativePath)

	params := make([]any, 0, len(method.RequiredParams))
	for _, param := range method.RequiredParams {
		params = append(params, mapVariable(param))
	}
	if method.RestParam != nil {
		if rest, ok := method.RestParam.(*blangast.BLangSimpleVariable); ok {
			params = append(params, mapVariable(*rest))
		}
	}

	return map[string]any{
		"owner":        owner,
		"method":       method.Name.Value,
		"path":         path,
		"relativePath": relativePath,
		"pathSegments": segments,
		"pathParams":   pathParams,
		"params":       params,
		"returnType":   typeString(method.GetReturnTypeDescriptor()),
	}
}

func mapResourcePath(resourcePath []blangast.BLangResourcePathSegment) ([]any, []any, string) {
	segments := make([]any, 0, len(resourcePath))
	pathParams := []any{}
	path := ""

	for _, seg := range resourcePath {
		switch seg.Kind {
		case blangast.ResourcePathSegmentName:
			segments = append(segments, map[string]any{"kind": "literal", "name": seg.Name})
			path += "/" + seg.Name
		case blangast.ResourcePathSegmentParam:
			name := seg.Name
			param := map[string]any{"kind": "path", "name": name, "type": typeString(seg.ParamType)}
			segments = append(segments, param)
			pathParams = append(pathParams, param)
			path += "/{" + name + "}"
		case blangast.ResourcePathSegmentParamRest:
			name := seg.Name
			param := map[string]any{"kind": "pathRest", "name": name, "type": typeString(seg.ParamType)}
			segments = append(segments, param)
			pathParams = append(pathParams, param)
			path += "/{" + name + "...}"
		}
	}

	if path == "" {
		path = "/"
	}
	return segments, pathParams, path
}

func mapVariable(param blangast.BLangSimpleVariable) map[string]any {
	name := ""
	if param.Name != nil {
		name = param.Name.Value
	}
	return map[string]any{
		"name": name,
		"type": typeString(param.TypeNode()),
	}
}

func serviceBasePath(service *blangast.BLangService) string {
	if service.AttachPointLiteral != nil {
		return literalString(service.AttachPointLiteral)
	}
	path := ""
	for _, segment := range service.AbsoluteResourcePath {
		path += "/" + segment.Value
	}
	if path == "" {
		return "/"
	}
	return path
}

func joinResourcePaths(basePath, relativePath string) string {
	if basePath == "" || basePath == "/" {
		return relativePath
	}
	if relativePath == "/" {
		return basePath
	}
	return basePath + relativePath
}

func expressionStrings(exprs []blangast.BLangExpression) []any {
	result := make([]any, 0, len(exprs))
	for _, expr := range exprs {
		if node, ok := expr.(blangast.BLangNode); ok {
			printer := blangast.PrettyPrinter{}
			result = append(result, printer.Print(node))
		}
	}
	return result
}

func literalString(lit *blangast.BLangLiteral) string {
	if lit == nil || lit.Value == nil {
		return ""
	}
	if str, ok := lit.Value.(string); ok {
		return str
	}
	return ""
}

func typeString(typ any) string {
	if typ == nil {
		return ""
	}

	switch t := typ.(type) {
	case blangast.TypeData:
		return typeString(t.TypeDescriptor)
	case *blangast.BLangValueType:
		return string(t.TypeKind)
	case *blangast.BLangBuiltInRefTypeNode:
		return string(t.TypeKind)
	case *blangast.BLangUserDefinedType:
		if t.PkgAlias.Value != "" {
			return t.PkgAlias.Value + ":" + t.TypeName.Value
		}
		return t.TypeName.Value
	case *blangast.BLangArrayType:
		return typeString(t.Elemtype) + "[]"
	}

	if node, ok := typ.(blangast.BLangNode); ok {
		printer := blangast.PrettyPrinter{}
		return printer.Print(node)
	}
	return ""
}
