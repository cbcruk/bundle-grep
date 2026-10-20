/**
 * Archives git repositories as bundles and searches them with GitHub-style
 * code search queries, run through `git grep`.
 *
 * @module
 */

export { ArchiveMismatchError, FileSystemError, InvalidRepoNameError } from './archive/archive.errors'
export { archivePaths } from './archive/archive-paths'
export type { ArchiveEntry, ArchiveLayout, ArchivePaths, RepoMetadata } from './archive/archive.types'
export { listArchive } from './archive/list-archive'
export { readMetadata, writeMetadata } from './archive/metadata'
export { BlobNotFoundError, BlobTooLargeError } from './blob/blob.errors'
export type { ReadBlobError, ReadBlobOptions } from './blob/blob.types'
export { readBlob } from './blob/read-blob'
export { GitError } from './git/git.errors'
export { GhError } from './github/github.errors'
export { listGithubRepos, viewGithubRepo } from './github/github-repos'
export type { GithubOptions, ListGithubReposOptions } from './github/github.types'
export { compileQuery } from './plan/compile-query'
export { languageNames, languageOf } from './plan/languages'
export { listMatchingFiles } from './plan/list-matching-files'
export { QueryCompileError } from './plan/plan.errors'
export type {
  AllLeaf,
  Expr,
  FileExpr,
  FileLeaf,
  FilterLeaf,
  GrepLeaf,
  HistoryPattern,
  Language,
  LanguageLeaf,
  ListMatchingFilesOptions,
  NoneLeaf,
  PathLeaf,
  QueryExpr,
  SearchPlan,
  SplitQuery,
  SymbolLeaf,
  ValidateRegexesOptions,
} from './plan/plan.types'
export { splitQuery } from './plan/split-query'
export { specializePlan } from './plan/specialize-plan'
export { validateRegexes } from './plan/validate-regexes'
export { parseQuery } from './query/parse-query'
export { PcreUnavailableError } from './search/search.errors'
export { search, toSearchRepoError } from './search/search'
export type {
  ChangedFile,
  ChangedLine,
  CommitInfo,
  MatchRange,
  SearchEvent,
  SearchFacets,
  SearchLine,
  SearchOptions,
  SearchRepo,
  SearchRepoError,
} from './search/search.types'
export { QueryParseError } from './query/query.errors'
export { loadArchivedRepos } from './repos/load-archived-repos'
export { repoHolds } from './repos/repo-holds'
export type { ArchivedRepo, LoadedRepos } from './repos/repos.types'
export { restoreRepo, restoreRepos } from './restore/restore-repo'
export type { RestoreError, RestoreEvent, RestoreOptions, RestoreOutcome, RestoreStatus } from './restore/restore.types'
export { expandHome } from './sync/expand-home'
export { resolveSyncSource } from './sync/resolve-sync-source'
export { syncRepo, syncRepos } from './sync/sync-repo'
export type {
  ResolvedSource,
  ResolveSyncSourceOptions,
  SourceError,
  SyncError,
  SyncEvent,
  SyncOptions,
  SyncOutcome,
  SyncStatus,
  SyncTarget,
} from './sync/sync.types'
export { targetFromUrl } from './sync/target-from-url'
export { symbolLanguages } from './symbols/grammars'
export { SymbolParserError } from './symbols/symbols.errors'
export { symbolIndex } from './symbols/symbol-index'
export type {
  IndexedFile,
  SymbolDefinition,
  SymbolIndex,
  SymbolIndexError,
  SymbolIndexOptions,
  SymbolKind,
} from './symbols/symbols.types'
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
