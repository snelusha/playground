import ballerina/io;

import playground/response_aggregator.types;

// Response flags
public const int CACHED = 1 << 0;
public const int PARTIAL = 1 << 1;
public const int PAGINATED = 1 << 2;

// Processes and displays an API response with its flags and result.
public function processResponse(types:ApiResponse res) {
    io:println("\nEndpoint: ", res.ep, ",\n  Status: ", res.status);

    if res.flags >= PAGINATED {
        io:println("  [Paginated]");
    } else if res.flags == CACHED {
        io:println("  [Cached]");
    } else {
        io:println("  [Partial]");
    }

    any result = res.result;
    if result is int {
        int count = <int>result;
        io:println("  Count: ", count);
    } else if result is string {
        io:println("  Info: ", result);
    }
}

