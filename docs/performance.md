# Search performance

How search time grows with the archive, where it goes, and whether an index
backend is worth adding. Measured for issue #13; rerun with `pnpm bench`.

## Setup

- Apple M1 Pro (8 cores), 16 GB, macOS 26.5, git 2.50.1, Bun 1.4.0.
- Corpus: 117 real repositories (116 non-empty), cloned bare. Their `HEAD`
  trees hold 30,073 files and 970 MB. The largest are PebbleOS (7,373 files,
  156 MB) and ant-design (4,257 files, 29,806 commits).
- 500 repositories reuse the 117 under new names. Git does the same work again,
  but the page cache is shared, so every number here is warm-cache.
- Each cell is the median of 3 runs after a warm-up, with `--limit 100`, from
  `search()` to its `done` event. The count of matching files, or commits for
  `history:`, is in parentheses.

```sh
pnpm bench --dir <directory of bare repositories> [--counts 10,100,500] [--runs 3] [--query q]...
```

## Results

Before is `main` at the start of #13; after is the changes below.

| Query | 10 before | 10 after | 100 before | 100 after | 500 before | 500 after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `bundleGrepNoSuchToken` | 342 ms | 218 ms | 1.93 s | 0.94 s | 8.82 s | 4.69 s |
| `useState` | 871 ms | 705 ms | 1.99 s | 1.23 s | 10.24 s | 5.53 s |
| `content:useState` | 659 ms | 663 ms | 948 ms | 877 ms | 5.46 s | 3.99 s |
| `/use[A-Z]\w+/` | 1.08 s | 728 ms | 2.43 s | 1.27 s | 10.59 s | 5.57 s |
| `path:README` | 223 ms | 72 ms | 1.02 s | 546 ms | 5.04 s | 2.62 s |
| `useState language:typescript` | 233 ms | 81 ms | 1.49 s | 668 ms | 6.63 s | 3.11 s |
| `symbol:useState` | 48 ms | 34 ms | 391 ms | 230 ms | 1.94 s | 1.11 s |
| `history:useState` | 35.9 s | 1.11 s | 69.1 s | 0.94 s | 237.3 s | 0.93 s |

Every query except `history:` matched the same files before and after.

## Where the time goes

- **Starting git.** One `git` process costs about 11 ms before it does any work
  (100 × `git rev-parse` take 1.1 s, against 0.13 s for 100 × `true`). A
  search runs two to four git commands per repository, so small repositories
  cost about 10 ms each whatever they hold. That cost sets the slope of
  roughly 8–10 ms per repository at 500.
- **Reading blobs.** `git grep` decompresses every blob it reads. On PebbleOS a
  fixed-string grep takes 646 ms with git's threads and 1,366 ms with
  `--threads=1`. Bigger trees cost in proportion.
- **Telling text from binary.** Before #13, any `path:`, `language:` or bare
  term listed the tree's text files with `git grep -I -l -e ''`, which reads
  every blob (157 ms on PebbleOS, against 25 ms for `ls-tree`). That doubled the
  cost of a bare term, since `useState` means `content:useState OR
  path:useState`.
- **Regex engines.** These differ by repository rather than in one direction:
  on PebbleOS, ERE took 326 ms and PCRE 634 ms; on ant-design, ERE took 520 ms
  and PCRE 98 ms. Nothing to change.
- **`git log -G`.** This diffs every commit it walks past. ant-design's full
  history takes 34 s for 705 matches, while the first 10 matches take 0.5 s.
- **Concurrency.** Going from 4 to 8 repositories at once gained 3–14% at 500
  repositories, and 16 gained nothing more, as git already uses every core.
- **Symbol indexes.** A warm load is 12–23 ms, most of it the `rev-parse` that
  resolves the commit. Parsing the largest index (2.3 MB, PebbleOS) is about
  11 ms. An in-process cache would save at most that, so none was added.

## Changes made

- **Text check only where needed.** The universe is now the regular files from
  `ls-tree`. Files found by a `grep` or `symbol:` leaf are known to be text.
  Only the remaining matches, such as what a `path:` selected, are checked: by
  name when there are at most 1,000 of them, by one whole-tree read otherwise.
- **`history:` stops early.** Pass 1 streams, and git is stopped once more
  commits than the limit were found across repositories; repositories not yet
  started are skipped. `done.capped` then marks the totals as lower bounds,
  shown as `100+ commits`.
- **Default concurrency** is the number of CPUs, at most 8, up from 4.

## Alternatives

Both were measured on the same 116 repositories, where the current pipeline
takes about 0.9–1.1 s for `content:useState`.

| | Time | Disk | Other costs |
| --- | ---: | ---: | --- |
| `git grep` (current) | 0.9–1.1 s | — | none |
| ripgrep 14.1 over a checkout | 0.72–0.76 s | +1.0 GB checkout (12 s to extract) | a second copy of every tree to keep in sync |
| Zoekt (trigram index) | 85–108 ms per query, including CLI startup | +496 MB index (26 s to build) | two Go binaries of 40 MB each (the app is 82 MB); RE2 regexes, without lookaround or backreferences; files over 2 MB skipped by default; reindex after every sync |

The ripgrep and Zoekt figures only list matching files, which is less work
than the pipeline's file list plus matching lines, so they flatter both
alternatives. ripgrep is not worth a second copy of the archive for a 1.3×
gain. Zoekt is
about 10× faster and its cost does not grow with the number of repositories.
It is the backend to reach for if the archive outgrows `git grep`.

## Conclusion and thresholds

`git grep` stays the backend. Search time grows linearly, at about
8–10 ms per repository plus the time to read the trees:

- **Up to ~100 repositories or ~1 GB of trees:** most queries finish within
  about 1 s; `content:` and regex queries take up to 1.3 s.
- **~500 repositories:** 1–6 s, which is usable but no longer interactive.
- **Beyond that,** or if sub-second search over hundreds of repositories
  matters, put an index such as Zoekt behind the existing `listMatchingFiles` /
  `collectLines` boundary. A plan already compiles to leaves an index can
  answer (`grep`, `path`, `language`, `symbol`), so the backend can be swapped
  without touching the query language. That boundary is left as is until an
  archive needs it.
