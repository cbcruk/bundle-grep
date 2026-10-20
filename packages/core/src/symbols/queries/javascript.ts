/**
 * The tags query for JavaScript added to the shared ECMAScript query.
 *
 * @module
 */

/** The query source, in tree-sitter's query language. */
export const query: string = String.raw`(field_definition property: (property_identifier) @name value: [(arrow_function) (function_expression)]) @definition.method
`
