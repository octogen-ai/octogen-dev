# Product refresh removal (OCT-4122)

The TypeScript `refreshProducts`, Python `refresh_products`, and `octogen refresh`
CLI command are removed along with their generated models and operation entries.
Both Platform refresh routes are removed outright. Existing installed clients may
receive ordinary unmatched-route errors. There is no compatibility command,
redirect, or automatic lookup substitution.

Lookup, including its existing on-demand cache policy, keeps its own contract.
A lookup response does not prove completion of a previous crawl or background
indexing operation. Package publication is a separate authorized release step;
this PR does not publish packages or retire production executors.
