# 🔗 aptos Connect

> Helps connect to the Aptos blockchain, create accounts, and manage transactions (normal and sponsored). Built
> off their [Aptos API](https://aptos.dev/). to keep things as lightweight as possible.

## 🚀 Quick Start

```bash
# Install
deno add jsr:@tundraconnect/aptos
```

```typescript
// Basic usage
import { Aptos } from '@tundraconnect/aptos';

const connect = new Aptos(); // Use TESTNET/DEVNET for testing. If no params passed, defaults to MAINNET

// TODO: Add basic usage example
const result = await connect.createAccount();
```

## 📚 Documentation

- **[Complete Documentation](.docs/README.md)** - Full API documentation and guides

## 🔗 Links

- [JSR Package](https://jsr.io/@tundraconnect/aptos)
- [Official API Docs](https://service.com/docs) <!-- TODO: Update with actual service docs -->
- [GitHub Issues](https://github.com/TundraSoft/tundra-connect/issues)

## 📄 License

MIT License - see [LICENSE](../LICENSE) file for details.
