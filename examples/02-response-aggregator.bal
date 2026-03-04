import ballerina/io;

// Aggregates responses from multiple API endpoints, categorizes them by status
// and flags, and processes mixed result types.
type ApiResponse record {|
    string ep;
    int status;
    int flags;
    any result;
|};

public function main() {
    // Response flags
    int cached = 1 << 0;
    int partial = 1 << 1;
    int paginated = 1 << 2;

    ApiResponse[] responses = [
        {ep: "/users", status: 200, flags: cached, result: 150},
        {ep: "/orders", status: 200, flags: cached + paginated, result: "paginated"},
        {ep: "/products", status: 206, flags: partial, result: 42}
    ];
    [string, int] healthCheck = ["/health", 200];

    io:println("Health Check: ", healthCheck[0], " (", healthCheck[1], ")");

    foreach ApiResponse res in responses {
        io:println("\nEndpoint: ", res.ep, ",\n  Status: ", res.status);

        if res.flags >= paginated {
            io:println("  [Paginated]");
        } else if res.flags == cached {
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
}
