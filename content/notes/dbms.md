---
title: Database Management Systems
level: beginner
language: en
---

# Database Management Systems

A database management system (DBMS) is software that stores, organizes, retrieves, and protects data. It gives applications a structured way to work with information while handling details such as concurrent access, backups, and permissions. A relational DBMS stores data in tables made of rows and columns. Examples include PostgreSQL, MySQL, and SQL Server. A document database stores flexible records, often as JSON-like documents.

## Tables and keys

A table represents one kind of entity, such as a customer or order. Each row is a record, and each column is an attribute. A primary key uniquely identifies a row. A foreign key refers to a key in another table and connects related data. For example, an `Orders` table can contain a `customer_id` foreign key that points to a row in `Customers`. These constraints help prevent invalid relationships.

## Normalization

Normalization organizes relational data to reduce unnecessary duplication and update errors. First normal form stores one value in each cell and avoids repeating groups. Second normal form removes dependencies on only part of a composite key. Third normal form removes dependencies between non-key columns. The goal is not to split every value into a separate table; a good design balances consistency, clarity, and query needs.

## Transactions and ACID

A transaction is a group of database operations treated as one unit. ACID describes four useful properties. Atomicity means all operations succeed or none do. Consistency preserves database rules. Isolation limits interference between simultaneous transactions. Durability means committed changes survive failures. For example, transferring money should debit one account and credit another in a single transaction, so the system does not leave only half the transfer completed.

## Indexes and queries

An index is an additional data structure that helps find rows faster, much like a book index. A query can use an index to avoid scanning every row, but indexes require storage and must be updated when data changes. SQL uses commands such as `SELECT`, `INSERT`, `UPDATE`, and `DELETE`. A `WHERE` clause filters rows, and joins combine related tables.

## Key points

- Use keys to identify records and express relationships.
- Normalize to reduce avoidable duplication.
- Use transactions for changes that must succeed together.
- Add indexes for frequently searched fields, then measure their effect.
- Apply least-privilege access and maintain tested backups.
