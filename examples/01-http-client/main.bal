import ballerina/http;
import ballerina/io;

type Customer record {|
    int id;
    string name;
    string email;
    boolean subscribed;
|};

type Subscriber record {|
    string name;
    string email;
|};

final http:Client apiClient = check new ("https://httpbin.org", {
    timeout: 10
});

public function main() returns error? {
    Customer[] customers = [
        {id: 1, name: "Asha", email: "asha@example.com", subscribed: true},
        {id: 2, name: "Ben", email: "ben@example.com", subscribed: false},
        {id: 3, name: "Chen", email: "chen@example.com", subscribed: true}
    ];

    Subscriber[] subscribers = from var customer in customers
        where customer.subscribed
        select {
            name: customer.name,
            email: customer.email
        };

    http:Response response = check apiClient->post("/anything/subscribers", subscribers);

    io:println("Status: ", response.statusCode);
    io:println("Subscribers sent to the API:");
    foreach Subscriber subscriber in subscribers {
        io:println("- ", subscriber.name, " <", subscriber.email, ">");
    }
}
