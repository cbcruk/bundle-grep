(public_field_definition name: (property_identifier) @name value: [(arrow_function) (function_expression)]) @definition.method
(function_signature name: (identifier) @name) @definition.function
(method_signature name: (property_identifier) @name) @definition.method
(abstract_method_signature name: (property_identifier) @name) @definition.method
(abstract_class_declaration name: (type_identifier) @name) @definition.class
(interface_declaration name: (type_identifier) @name) @definition.interface
(type_alias_declaration name: (type_identifier) @name) @definition.type
(enum_declaration name: (identifier) @name) @definition.enum
(module name: [(identifier) @name (string (string_fragment) @name)]) @definition.module
(internal_module name: [(identifier) (nested_identifier)] @name) @definition.module
