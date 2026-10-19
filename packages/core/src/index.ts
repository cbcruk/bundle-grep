/**
 * Archives git repositories as bundles and searches them with GitHub-style
 * code search queries, run through `git grep`.
 *
 * @module
 */

export { GitError } from './git/git.errors'
export { compileQuery } from './plan/compile-query'
export { listMatchingFiles } from './plan/list-matching-files'
export { QueryCompileError } from './plan/plan.errors'
export type {
  AllLeaf,
  Expr,
  FileExpr,
  FileLeaf,
  FilterLeaf,
  GrepLeaf,
  Language,
  LanguageLeaf,
  ListMatchingFilesOptions,
  NoneLeaf,
  PathLeaf,
  QueryExpr,
  SearchPlan,
} from './plan/plan.types'
export { specializePlan } from './plan/specialize-plan'
export { parseQuery } from './query/parse-query'
export { QueryParseError } from './query/query.errors'
export type {
  AndNode,
  FilterKey,
  FilterNode,
  IsValue,
  MatchField,
  MatchNode,
  NotNode,
  OrNode,
  Pattern,
  QueryNode,
  Span,
} from './query/query.types'
