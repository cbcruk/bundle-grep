/**
 * The tags query for Ruby.
 *
 * @module
 */

/** The query source, in tree-sitter's query language. */
export const query: string = String.raw`(method name: (_) @name) @definition.method
(singleton_method name: (_) @name) @definition.method
(alias name: (_) @name) @definition.method
(class name: [(constant) @name (scope_resolution name: (_) @name)]) @definition.class
(module name: [(constant) @name (scope_resolution name: (_) @name)]) @definition.module
(assignment left: (constant) @name) @definition.constant
`
