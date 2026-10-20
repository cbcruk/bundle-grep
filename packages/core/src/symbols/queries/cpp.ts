/**
 * The tags query for C++ added to the C query.
 *
 * @module
 */

/** The query source, in tree-sitter's query language. */
export const query: string = String.raw`((function_declarator declarator: [(field_identifier) (destructor_name) (operator_name)] @name) @definition.method
  (#set! outside "compound_statement"))
((function_declarator declarator: (qualified_identifier) @qualified) @definition.method
  (#set! outside "compound_statement"))
(class_specifier name: (type_identifier) @name body: (_)) @definition.class
(namespace_definition name: [(namespace_identifier) (nested_namespace_specifier)] @name) @definition.module
(alias_declaration name: (type_identifier) @name) @definition.type
`
