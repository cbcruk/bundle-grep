(function_declarator declarator: (field_identifier) @name) @definition.method
(function_declarator declarator: (qualified_identifier name: (identifier) @name)) @definition.method
(class_specifier name: (type_identifier) @name body: (_)) @definition.class
(namespace_definition name: (namespace_identifier) @name) @definition.module
(alias_declaration name: (type_identifier) @name) @definition.type
