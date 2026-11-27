---
title: Operating Systems Basics
level: beginner
language: en
---

# Operating Systems Basics

An operating system (OS) manages a computer's hardware and provides services to applications. It coordinates the processor, memory, storage, devices, and network. The kernel is the central part of the OS that handles privileged operations. Applications request these services through system calls rather than directly controlling hardware. Linux, Windows, macOS, Android, and iOS are examples of operating systems.

## Processes and threads

A process is a running program with its own address space and resources. A thread is a path of execution within a process. Threads in one process can share memory, which makes communication convenient but requires care when several threads update the same data. The OS scheduler gives processes or threads time on the CPU. A context switch saves one task's state and loads another's so the processor can share time among tasks.

## Memory management

The OS allocates memory to processes and protects one process from reading another's private memory. Virtual memory gives each process an address space that appears separate from physical RAM. The OS and hardware translate virtual addresses to physical locations using page tables. When RAM is limited, parts of memory may be moved to storage, but this is much slower than RAM. Excessive paging can make a computer feel unresponsive.

## Files and devices

A file system organizes data into files and directories and tracks where file contents are stored. Permissions control who can read, change, or execute a file. Device drivers let the OS communicate with hardware such as a keyboard, disk, or printer. For example, when an application saves a document, it asks the OS to write data through the file system and the appropriate storage driver.

## Concurrency and deadlocks

Concurrency occurs when tasks make progress during overlapping periods. Synchronization tools such as locks protect shared data. A deadlock can occur when tasks wait forever for resources held by one another. Careful lock ordering, short critical sections, and timeouts help reduce this risk.

## Key points

- The kernel mediates access to hardware.
- Processes are isolated programs; threads share a process's resources.
- Virtual memory supports isolation and flexible memory use.
- Drivers and file systems connect applications to devices and stored data.
- Scheduling, synchronization, and permissions help the system run safely.
