import response_aggregator.handler;
import response_aggregator.types;

import ballerina/io;

public function main() {
    types:ApiResponse[] responses = [
        {ep: "/users", status: 200, flags: handler:CACHED, result: 150},
        {ep: "/orders", status: 200, flags: handler:CACHED + handler:PAGINATED, result: "paginated"},
        {ep: "/products", status: 206, flags: handler:PARTIAL, result: 42}
    ];
    [string, int] healthCheck = ["/health", 200];

    io:println("Health Check: ", healthCheck[0], " (", healthCheck[1], ")");

    foreach types:ApiResponse res in responses {
        handler:processResponse(res);
    }
}

