/** The empty search screen: what queries can say, and the keyboard shortcuts. */
export function StartPage(): React.JSX.Element {
  return (
    <div className="app-start">
      <h1>Search your archive</h1>
      <p>
        Queries follow GitHub code search: <code>useState language:typescript</code>, <code>repo:owner/name</code>,{' '}
        <code>path:/src/**</code>, <code>symbol:useState</code>, <code>/regex/</code>, <code>"exact phrase"</code>,{' '}
        <code>NOT</code>, <code>OR</code>.
      </p>
      <p>
        <code>ref:v1.0 useState</code> searches a branch, tag, or commit instead of the default branch, and{' '}
        <code>history:useState path:src</code> finds the commits that added or removed matching lines, deleted code
        included.
      </p>
      <p>
        Press <kbd>/</kbd> to search, <kbd>j</kbd>/<kbd>k</kbd> to move between results, <kbd>Enter</kbd> to open one,
        and <kbd>Esc</kbd> to go back.
      </p>
    </div>
  )
}
