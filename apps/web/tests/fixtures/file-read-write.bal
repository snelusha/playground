import ballerina/io;

public function main() returns error? {
    check io:fileWriteString("string.txt", "Hello");
    string first = check io:fileReadString("string.txt");
    io:println(first == "Hello");

    check io:fileWriteString("string.txt", " World", io:APPEND);
    string second = check io:fileReadString("string.txt");
    io:println(second == "Hello World");

    byte[] expectedBytes = [72, 101, 108, 108, 111];
    check io:fileWriteBytes("bytes.bin", expectedBytes);
    byte[] bytes = check io:fileReadBytes("bytes.bin");
    io:println(bytes == expectedBytes);

    check io:fileWriteJson("data.json", {"name": "Alice", "age": 30});
    json result = check io:fileReadJson("data.json");
    boolean isExpectedJson = false;
    if result is map<json> {
        isExpectedJson = result["name"] == "Alice" && result["age"] == 30;
    }
    io:println(isExpectedJson);

    xml data = xml `<book><title>Clean Code</title></book>`;
    check io:fileWriteXml("data.xml", data);
    xml xmlResult = check io:fileReadXml("data.xml");
    io:println(xmlResult);

    string[] expectedLines = ["Alpha", "Beta", "Gamma"];
    check io:fileWriteLines("lines.txt", expectedLines);
    string[] lines = check io:fileReadLines("lines.txt");
    io:println(lines == expectedLines);
}
