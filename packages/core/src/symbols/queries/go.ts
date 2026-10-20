/**
 * The tags query for Go.
 *
 * @module
 */

/** The query source, in tree-sitter's query language. */
export const query: string = String.raw`(function_declaration name: (identifier) @name) @definition.function
(method_declaration receiver: (parameter_list (parameter_declaration type: (_) @scope)) name: (field_identifier) @name) @definition.method
(method_declaration name: (field_identifier) @name) @definition.method
(type_spec name: (type_identifier) @name type: (interface_type)) @definition.interface
(type_spec name: (type_identifier) @name type: (struct_type)) @definition.struct
(type_spec name: (type_identifier) @name) @definition.type
(type_alias name: (type_identifier) @name) @definition.type
(source_file (const_declaration (const_spec (identifier) @name (#not-eq? @name "_")) @definition.constant))
(source_file (var_declaration (var_spec (identifier) @name (#not-eq? @name "_")) @definition.variable))
`
