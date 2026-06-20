import ballerina/http;
import ballerina/io;

type Order record {|
    string id;
    string customer;
    int amount;
    string status;
|};

type OrderSummary record {|
    string id;
    string customer;
    int amount;
|};

final http:Client apiClient = check new ("https://httpbin.org", {
    timeout: 10
});

public function main() returns error? {
    Order[] orders = [
        {id: "ORD-1001", customer: "Asha", amount: 120, status: "pending"},
        {id: "ORD-1002", customer: "Ben", amount: 75, status: "delivered"},
        {id: "ORD-1003", customer: "Chen", amount: 210, status: "pending"}
    ];

    OrderSummary[] pendingOrders = from var order in orders
        where order.status == "pending"
        select {
            id: order.id,
            customer: order.customer,
            amount: order.amount
        };

    http:Response response = check apiClient->post("/anything/orders/pending", pendingOrders);

    io:println("Status: ", response.statusCode);
    io:println("Pending orders sent to the API:");
    foreach OrderSummary order in pendingOrders {
        io:println("- ", order.id, " | ", order.customer, " | $", order.amount);
    }
}
