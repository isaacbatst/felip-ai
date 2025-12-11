# Architecture Documentation

## Overview

This NestJS application is a migration from a functional programming approach to Object-Oriented Programming (OOP) with SOLID principles and composition patterns.

## SOLID Principles Applied

### Single Responsibility Principle (SRP)

Each class/service has a single, well-defined responsibility:

- **`MilesProgramNormalizerService`**: Only normalizes miles program names
- **`PurchaseValidatorService`**: Only validates purchase requests
- **`PriceCalculatorService`**: Only calculates prices
- **`QuoteFormatterService`**: Only formats quote responses
- **`MessageParserService`**: Only parses messages using OpenAI
- **`GoogleSheetsService`**: Only communicates with Google Sheets API
- **`CacheService`**: Only manages generic caching
- **`PriceTableCacheService`**: Only manages price table caching
- **`TelegramBotService`**: Only manages Telegram bot lifecycle
- **`TelegramMessageHandler`**: Only handles message processing
- **`TelegramCommandHandler`**: Only handles command processing

### Open/Closed Principle (OCP)

- Services are open for extension through interfaces but closed for modification
- New parsers can be added by implementing `IMessageParser`
- New price providers can be added by implementing `IPriceTableProvider`
- Handlers can be extended without modifying existing code

### Liskov Substitution Principle (LSP)

- All implementations of `IMessageParser` and `IPriceTableProvider` are interchangeable
- Any service implementing these interfaces can be used without breaking functionality

### Interface Segregation Principle (ISP)

- Interfaces are small and focused:
  - `IMessageParser`: Only exposes `parse()` method
  - `IPriceTableProvider`: Only exposes `getPriceTable()` method
- Clients depend only on what they need, not on unused methods

### Dependency Inversion Principle (DIP)

- High-level modules depend on abstractions (interfaces), not concrete implementations:
  - `TelegramMessageHandler` depends on `IMessageParser` and `IPriceTableProvider`, not concrete classes
  - Services depend on interfaces, allowing easy swapping of implementations
- Dependency injection is used throughout via NestJS's DI container

## Composition Over Inheritance

The application uses composition extensively:

1. **`PriceTableCacheService`** composes `CacheService` internally
2. **`TelegramBotService`** composes `TelegramMessageHandler` and `TelegramCommandHandler`
3. **`TelegramMessageHandler`** composes multiple services (parser, validator, calculator, formatter)
4. **`PurchaseValidatorService`** composes `MilesProgramNormalizerService`

## Architecture Layers

### Domain Layer (`src/domain/`)

Contains business logic and domain models:

- **Types**: Domain types and interfaces
- **Services**: Business logic services (validators, calculators, formatters)
- **Interfaces**: Abstractions for dependency inversion
- **Utils**: Domain utilities (interpolation, fuzzy matching)

### Infrastructure Layer (`src/infrastructure/`)

Contains external integrations and technical implementations:

- **Cache**: Caching implementations
- **Google Sheets**: Google Sheets API integration
- **OpenAI**: OpenAI API integration
- **Telegram**: Telegram bot and user client implementations
- **Price Table**: Price table provider implementation

### Configuration Layer (`src/config/`)

Contains configuration management:

- **`AppConfigService`**: Validates and provides application configuration

## Module Structure

### DomainModule

Exports domain services that contain business logic.

### InfrastructureModule

- Imports `DomainModule` to use domain services
- Provides infrastructure services
- Uses factory pattern for complex service initialization
- Exports services needed by other modules

### AppModule

- Root module that composes `DomainModule` and `InfrastructureModule`
- Entry point of the application

## Key Design Patterns

### Adapter Pattern

- **`MessageParserService`**: Adapts OpenAI client to `IMessageParser` interface
- **`PriceTableProviderService`**: Adapts `PriceTableCacheService` to `IPriceTableProvider` interface

### Factory Pattern

- Used in `InfrastructureModule` for creating `PriceTableCacheService` and `TelegramBotService` with complex dependencies

### Strategy Pattern

- Different parsers can be swapped by implementing `IMessageParser`
- Different price providers can be swapped by implementing `IPriceTableProvider`

### Composition Pattern

- Services are composed together rather than inheriting from base classes
- Allows for flexible, modular design

## Dependency Flow

```
AppModule
  ├── DomainModule
  │   ├── MilesProgramNormalizerService
  │   ├── PurchaseValidatorService (uses MilesProgramNormalizerService)
  │   ├── PriceCalculatorService
  │   └── QuoteFormatterService
  │
  └── InfrastructureModule
      ├── AppConfigService
      ├── GoogleSheetsService
      ├── OpenAIService
      ├── MessageParserService (uses OpenAIService, implements IMessageParser)
      ├── CacheService
      ├── PriceTableCacheService (uses CacheService, GoogleSheetsService)
      ├── PriceTableProviderService (uses PriceTableCacheService, implements IPriceTableProvider)
      ├── TelegramMessageHandler (uses IMessageParser, IPriceTableProvider, domain services)
      ├── TelegramCommandHandler (uses PriceTableCacheService, QuoteFormatterService)
      ├── TelegramBotService (uses handlers, IMessageParser, IPriceTableProvider)
      └── TelegramUserClientService
```

## Benefits of This Architecture

1. **Testability**: Each service can be tested in isolation with mocked dependencies
2. **Maintainability**: Clear separation of concerns makes code easier to understand and modify
3. **Extensibility**: New features can be added without modifying existing code
4. **Flexibility**: Implementations can be swapped easily through dependency injection
5. **Reusability**: Services can be reused across different contexts
6. **Type Safety**: TypeScript interfaces ensure compile-time safety

## Migration Notes

The migration from functional to OOP:

1. **Functions → Classes**: Functional factories converted to injectable services
2. **Closures → Composition**: State management moved from closures to class properties
3. **Dependency Injection**: Manual dependency passing replaced with NestJS DI
4. **Interfaces**: Added interfaces for better abstraction and testability
5. **Modules**: Organized code into feature-based modules




