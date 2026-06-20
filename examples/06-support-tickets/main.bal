import ballerina/http;
import ballerina/io;

type Ticket record {|
    string id;
    string customer;
    string message;
    string priority;
    boolean open;
|};

type Escalation record {|
    string ticketId;
    string customer;
    string reason;
|};

final http:Client apiClient = check new ("https://httpbin.org", {
    timeout: 10
});

function escalationReason(Ticket ticket) returns string|error {
    if ticket.message.length() == 0 {
        return error("empty support ticket: " + ticket.id);
    }
    return "High priority open ticket: " + ticket.message;
}

public function main() returns error? {
    Ticket[] tickets = [
        {id: "TCK-001", customer: "Asha", message: "Payment failed", priority: "high", open: true},
        {id: "TCK-002", customer: "Ben", message: "Need invoice copy", priority: "low", open: true},
        {id: "TCK-003", customer: "Chen", message: "Cannot access account", priority: "high", open: true}
    ];

    Ticket[] urgentTickets = from var ticket in tickets
        where ticket.open && ticket.priority == "high"
        select ticket;

    Escalation[] escalations = [];
    foreach Ticket ticket in urgentTickets {
        escalations.push({
            ticketId: ticket.id,
            customer: ticket.customer,
            reason: check escalationReason(ticket)
        });
    }

    http:Response response = check apiClient->post("/anything/support/escalations", escalations);

    io:println("Status: ", response.statusCode);
    io:println("Escalations sent to the API:");
    foreach Escalation escalation in escalations {
        io:println("- ", escalation.ticketId, " | ", escalation.customer);
    }
}
