# langchain-storerouter

LangChain tools for [StoreRouter](https://storerouter.ai): live, structured
product data from real merchant catalogs. Agents can search products across
hundreds of stores, turn a product URL into a complete record, find stores that
sell something, and discover brands.

## Installation

```bash
pip install -U langchain-storerouter
```

## Credentials

Create an API key at [platform.storerouter.ai](https://platform.storerouter.ai)
and export it:

```bash
export STOREROUTER_API_KEY="..."
```

Every tool and the toolkit also take `api_key=` directly. When
`STOREROUTER_API_KEY` is unset, `OCTOGEN_PLATFORM_API_KEY` is read instead.

## Tools

| Tool                         | Class                      | Use it when                                           |
| ---------------------------- | -------------------------- | ----------------------------------------------------- |
| `storerouter_product_search` | `StoreRouterProductSearch` | The user describes something to buy                   |
| `storerouter_product_lookup` | `StoreRouterProductLookup` | The user has a product page URL                       |
| `storerouter_store_search`   | `StoreRouterStoreSearch`   | The user asks which stores sell something             |
| `storerouter_brand_search`   | `StoreRouterBrandSearch`   | The user wants brands that fit a taste or a reference |

`StoreRouterToolkit().get_tools()` returns all four.

## Use with an agent

```python
from langchain.agents import create_agent
from langchain_storerouter import StoreRouterToolkit

agent = create_agent(
    "anthropic:claude-sonnet-5-5",
    tools=StoreRouterToolkit().get_tools(),
    system_prompt="You are a shopping assistant. Link every product you recommend.",
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "A linen midi dress under $200?"}]}
)
print(result["messages"][-1].content)
```

## Invoke a tool directly

```python
from langchain_storerouter import StoreRouterProductSearch

search = StoreRouterProductSearch()
print(search.invoke({"query": "linen midi dress", "max_price": 200, "limit": 5}))
```

```json
{
  "products": [
    {
      "title": "…",
      "brand": "…",
      "store": "…",
      "price": 178.0,
      "currency": "USD",
      "in_stock": true,
      "product_url": "https://…",
      "image_url": "https://…",
      "uuid": "…"
    }
  ],
  "next_cursor": "…"
}
```

`StoreRouterProductSearch` arguments: `query`, plus optional `min_price`,
`max_price`, `stores` (domains such as `["thereformation.com"]`), `limit` (1-50,
default 10) and `cursor` for the next page.

`StoreRouterProductLookup` takes a `url` and returns the product as Markdown:
prices, every variant's color, size and stock, images, materials and
description.

## Content and artifacts

Each tool uses `response_format="content_and_artifact"`. The model sees a compact
rendering; the full API response is on the `ToolMessage.artifact` for your code:

```python
message = search.invoke(
    {
        "type": "tool_call",
        "id": "1",
        "name": "storerouter_product_search",
        "args": {"query": "linen dress"},
    }
)
message.content  # compact JSON for the model
message.artifact  # the full search page: images, variants' colors and sizes, scores
```

## Errors

Errors the model can act on, such as no match, an invalid filter or a rate
limit, come back as a `ToolMessage` so the agent can adjust. Errors that need a
human are raised: an invalid key, a key without API access, or exhausted credit.

## Prices and stock

Prices and stock reflect the last catalog refresh, not a live check. Send users
to the returned `product_url`, unchanged, to buy.

## Configuration

| Argument   | Environment variable                                   | Default                         |
| ---------- | ------------------------------------------------------ | ------------------------------- |
| `api_key`  | `STOREROUTER_API_KEY`, then `OCTOGEN_PLATFORM_API_KEY` | required                        |
| `base_url` | `STOREROUTER_BASE_URL`                                 | `https://api.storerouter.ai/v1` |
| `timeout`  |                                                        | `30.0` seconds                  |

## MCP

StoreRouter also runs a remote MCP server at `https://mcp.dev.storerouter.ai/mcp`,
authenticated with OAuth. It suits interactive clients. For agents running
headless, this package with an API key is simpler.

## Development

```bash
cd integrations/langchain
uv sync
uv run pytest                                  # unit and standard tests, no network
STOREROUTER_API_KEY=... uv run pytest tests/integration_tests   # live API
```

Tests run against the SDK in `sdks/python`, so an SDK change that breaks a tool
fails in the same pull request.

## License

Apache-2.0
