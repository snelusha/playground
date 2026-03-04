import ballerina/io;

// Shows pending orders with delivery fees
type Order record {|
    string id;
    string customer;
    int amount;
    string zone;
|};

public function main() {
    Order[] orders = [
        {id: "ORD001", customer: "Alice", amount: 150, zone: "Downtown"},
        {id: "ORD002", customer: "Bob", amount: 75, zone: "Suburb"},
        {id: "ORD003", customer: "Carol", amount: 200, zone: "Downtown"}
    ];
    map<int> deliveryFee = {"Downtown": 5, "Suburb": 10};

    io:println("=== Pending Orders ===");
    foreach int i in 0 ..< orders.length() {
        Order ord = orders[i];
        io:println(i + 1, ". ", ord.id, " | ",
                ord.customer, " | $", ord.amount,
                " | ", ord.zone, " (fee: $", deliveryFee[ord.zone], ")");
    }
}

