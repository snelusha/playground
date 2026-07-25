import ballerina/io;
import ballerina/lang.runtime;

public function main() {
    io:println("before");
    runtime:sleep(0.01);
    io:println("after");
    runtime:sleep(0);
    runtime:sleep(-1);
    io:println("done");
}
