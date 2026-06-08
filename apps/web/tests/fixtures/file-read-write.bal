import ballerina/io;

public function main() returns error? {
    check io:fileWriteString("out.txt", "Hello");
    string first = check io:fileReadString("out.txt");
    io:println(first == "Hello");

    check io:fileWriteString("out.txt", " World", io:APPEND);
    string second = check io:fileReadString("out.txt");
    io:println(second == "Hello World");
}
