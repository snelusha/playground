import ballerina/io;

type LibraryItem object {
    function title() returns string;
    function author() returns string;
    function borrowMessage(boolean isBorrowed) returns string;
    function returnMessage(boolean isBorrowed) returns string;
};

class Book {
    *LibraryItem;
    string name;
    string writer;

    function init(string name, string writer) {
        self.name = name;
        self.writer = writer;
    }

    function title() returns string {
        return self.name;
    }

    function author() returns string {
        return self.writer;
    }

    function borrowMessage(boolean isBorrowed) returns string {
        if isBorrowed {
            return "Sorry, " + self.name + " is already borrowed.";
        }
        return "You borrowed " + self.name + ".";
    }

    function returnMessage(boolean isBorrowed) returns string {
        if !isBorrowed {
            return "This book was not borrowed.";
        }
        return "You returned " + self.name + ".";
    }
}

public function main() {
    LibraryItem book1 = new Book("The Hobbit", "J.R.R. Tolkien");
    LibraryItem book2 = new Book("Harry Potter and the Philosopher’s Stone", "J.K. Rowling");

    io:println("=== Library Checkout ===");
    io:println("Book 1 | ", book1.title(), " | ", book1.author());
    io:println("Book 2 | ", book2.title(), " | ", book2.author());

    boolean book1Borrowed = false;
    io:println("\nBorrow #1 | ", book1.borrowMessage(book1Borrowed));
    book1Borrowed = true;
    io:println("Borrow #2 | ", book1.borrowMessage(book1Borrowed));

    io:println("\nReturn #1 | ", book1.returnMessage(book1Borrowed));
    book1Borrowed = false;
    io:println("Return #2 | ", book1.returnMessage(book1Borrowed));
}

