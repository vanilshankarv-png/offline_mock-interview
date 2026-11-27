---
title: Java Basics
level: beginner
language: en
---

# Java Basics

Java is a general-purpose, class-based programming language designed to run on many kinds of computers. Source code is compiled into bytecode, which runs on the Java Virtual Machine (JVM). This separation lets a compiled program work on different operating systems when a compatible JVM is installed. The Java Development Kit (JDK) includes tools for writing and compiling programs, while the Java Runtime Environment provides what is needed to run them.

## Variables and types

A variable is a named place to store a value. Java is statically typed, so each variable has a declared type. Primitive types include `int` for whole numbers, `double` for decimal values, `boolean` for true or false, and `char` for one character. Reference types include objects such as `String` and arrays. For example, `int attempts = 3;` stores a count, while `String learner = "Asha";` stores text. Choosing a suitable type makes a program easier to understand and helps the compiler catch mistakes.

## Decisions and loops

An `if` statement chooses code based on a condition. An `else` branch handles the other case. A `for` loop repeats work a known number of times, and a `while` loop repeats while a condition remains true. For example, a loop can print each item in a list. A loop needs a clear stopping condition; otherwise, it may run forever. `break` exits a loop, while `continue` skips to the next iteration.

## Classes and objects

A class is a blueprint that groups data and behavior. An object is one instance of a class. A `Student` class might have a `name` field and a `study()` method. A constructor initializes a new object. Encapsulation keeps internal state controlled: fields are often private and accessed through methods. Inheritance allows a class to reuse and extend another class, but composition is often simpler when objects merely work together.

## Key points

- The JVM runs Java bytecode across supported platforms.
- Types describe the values variables can hold.
- Conditions and loops control program flow.
- Classes define objects, and methods represent behavior.
- Clear names, small methods, and useful tests make Java programs easier to maintain.

For example, a simple grade calculator can store a score in an `int`, use an `if` statement to select a grade band, and return the result from a method. Splitting the calculation into a method makes it reusable and easier to test.
