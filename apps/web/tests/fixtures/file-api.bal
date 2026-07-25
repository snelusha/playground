import ballerina/file;
import ballerina/io;

public function main() returns error? {
    string base = "/tmp/file-api";
    check file:createDir(base, file:RECURSIVE);
    check file:create(base + "/source.txt");

    file:MetaData metadata = check file:getMetaData(base + "/source.txt");
    io:println(metadata.readable);
    io:println((check file:readDir(base)).length());

    check file:copy(base + "/source.txt", base + "/copy.txt");
    io:println(check file:test(base + "/copy.txt", file:EXISTS));

    check file:rename(base + "/copy.txt", base + "/renamed.txt");
    io:println(check file:test(base + "/renamed.txt", file:EXISTS));
    io:println(check file:test(base + "/copy.txt", file:EXISTS));

    string temp = check file:createTemp(prefix = "test-", suffix = ".txt");
    io:println(check file:test(temp, file:EXISTS));
    check file:remove(temp);

    check file:remove(base, file:RECURSIVE);
    io:println(check file:test(base, file:EXISTS));
}
