import ballerina/http;
import ballerina/io;

final http:Client apiClient = check new ("https://httpbin.org/", {
    timeout: 10
});

public function main() returns error? {
    http:Response res = check apiClient->get("/get?text=Hello%20Ballerina");
    io:println("GET Response Status: ", res.statusCode);
    io:println("GET Response Payload: ", check res.getTextPayload());

    json data = {"message": "HTTP client support is now live!"};
    res = check apiClient->post("/post", data);
    io:println("POST Response JSON Payload: ", check res.getJsonPayload());
    io:println("Post Response Content-Type Header: ", check res.getHeader("Content-Type"));

    res = check apiClient->execute("GET", "/delay/5", {"X-Custom-Header": "BallerinaTimeout"});
    io:println("Delayed Response Status: ", res.statusCode);
}
