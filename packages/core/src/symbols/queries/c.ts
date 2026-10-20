/**
 * The tags query for C.
 *
 * @module
 */

/** The query source, in tree-sitter's query language. */
export const query: string = String.raw`((function_declarator declarator: (identifier) @name) @definition.function
  (#set! outside "compound_statement"))
(struct_specifier name: (type_identifier) @name body: (_)) @definition.struct
(union_specifier name: (type_identifier) @name body: (_)) @definition.struct
(enum_specifier name: (type_identifier) @name body: (_)) @definition.enum
(type_definition declarator: (type_identifier) @name) @definition.type
(preproc_def name: (identifier) @name) @definition.macro
(preproc_function_def name: (identifier) @name) @definition.macro
`
