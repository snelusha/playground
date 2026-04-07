import ballerina/io;

type LibraryItem object {
    function title() returns string;
    function author() returns string;
    function borrowBook() returns string;
    function returnBook() returns string;
};

class Book {
    *LibraryItem;
    string name;
    string writer;
    boolean borrowed = false;

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

    function borrowBook() returns string {
        if self.borrowed {
            return "Sorry, " + self.name + " is already borrowed.";
        }
        self.borrowed = true;
        return "You borrowed " + self.name + ".";
    }

    function returnBook() returns string {
        if !self.borrowed {
            return "This book was not borrowed.";
        }
        self.borrowed = false;
        return "You returned " + self.name + ".";
    }
}

public function main() {
    LibraryItem book1 = new Book("The Hobbit", "J.R.R. Tolkien");
    LibraryItem book2 = new Book("Harry Potter and the Philosopher’s Stone", "J.K. Rowling");

    io:println("=== Library Checkout ===");
    io:println("Book 1 | ", book1.title(), " | ", book1.author());
    io:println("Book 2 | ", book2.title(), " | ", book2.author());

    io:println("\nBorrow #1 | ", book1.borrowBook());
    io:println("Borrow #2 | ", book1.borrowBook());

    io:println("\nReturn #1 | ", book1.returnBook());
    io:println("Return #2 | ", book1.returnBook());
}

