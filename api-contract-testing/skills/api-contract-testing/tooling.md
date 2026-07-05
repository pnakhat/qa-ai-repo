# API Contract Testing — Tooling Guide

Choose by *who owns the consumers* and *what the source of truth is*.

## Consumer-driven contracts
- **Pact** — the standard for consumer-driven contracts. SDKs for JS/TS, Java,
  .NET, Go, Python, Ruby, PHP, Rust. Use with a **Pact Broker** or **PactFlow**
  for storing contracts, `can-i-deploy`, and webhooks.
- Use when: internal microservices, you control the consumers, HTTP or messages.

## Spec-first (OpenAPI / REST)
- **Spectral** — lint the OpenAPI spec (style + governance) in CI.
- **Schemathesis** — property-based fuzzing that checks responses conform to the
  OpenAPI schema; great at finding edge-case violations.
- **Dredd** — validate an API against its OpenAPI/API Blueprint examples.
- **Prism** — spin up a mock server from the spec so consumers develop against
  the contract; also does request/response validation as a proxy.
- **oasdiff** — diff two OpenAPI specs and fail CI on breaking changes.

## GraphQL
- **GraphQL Inspector** / **graphql-schema-linter** — schema diffing and
  breaking-change detection against the previous schema.
- Apollo **Rover** + schema checks if using a registry/federation.

## Async / event-driven
- **AsyncAPI** as the contract for Kafka/AMQP/WebSocket messages.
- **Pact** message pacts for consumer-driven event contracts.

## General HTTP assertions (lighter weight)
- **Postman/Newman**, **Karate**, **REST Assured** (Java), **Tavern** (Python)
  for schema assertions when full contract tooling is overkill.

## Rule of thumb
- Internal services, you own both sides → **Pact + Broker**.
- Public/partner API with a published spec → **OpenAPI + Spectral + Schemathesis
  + oasdiff**.
- Both → publish the spec *and* run Pact for known internal consumers.
