### Added

- Set one fallback order for every agent in Settings > Providers. An agent with no order of its
  own moves to the first ready model in it at a usage limit or a provider error.

### Fixed

- An agent now moves to its backup model when its provider process exits or refuses to start a
  turn, and when a routine run meets such an error. Before, only an error at the end of a turn moved it.
