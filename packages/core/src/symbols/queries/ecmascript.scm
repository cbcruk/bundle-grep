(function_declaration name: (identifier) @name) @definition.function
(generator_function_declaration name: (identifier) @name) @definition.function
(class_declaration name: (_) @name) @definition.class
((method_definition name: [(property_identifier) (private_property_identifier)] @name) @definition.method
  (#not-eq? @name "constructor"))
(variable_declarator name: (identifier) @name value: [(arrow_function) (function_expression) (generator_function)]) @definition.function
(variable_declarator name: (identifier) @name value: (class)) @definition.class
(assignment_expression
  left: [(identifier) @name (member_expression property: (property_identifier) @name)]
  right: [(arrow_function) (function_expression)]) @definition.function
(pair key: (property_identifier) @name value: [(arrow_function) (function_expression)]) @definition.function
(program (lexical_declaration kind: "const" (variable_declarator name: (identifier) @name) @definition.constant))
(program (export_statement declaration: (lexical_declaration kind: "const" (variable_declarator name: (identifier) @name) @definition.constant)))
