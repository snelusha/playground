import ballerina/io;
import ballerina/os;

const string SECRET_KEY = "SECRET";
const string SECRET_VALUE = "some-secret";

public function main() returns error? {
    _ = check os:setEnv(SECRET_KEY, SECRET_VALUE);
    io:println(os:getEnv(SECRET_KEY) == SECRET_VALUE);

    map<string> envs = os:listEnv();
    io:println(envs.length() == 1);
    io:println(envs[SECRET_KEY] == SECRET_VALUE);

    _ = check os:unsetEnv(SECRET_KEY);
    io:println(os:getEnv(SECRET_KEY) == "");

    io:println(os:setEnv("", SECRET_VALUE) is error);
}
