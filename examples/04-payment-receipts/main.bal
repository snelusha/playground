import ballerina/http;
import ballerina/io;

type Payment record {|
    string invoiceId;
    string customer;
    int amount;
    string status;
|};

type Receipt record {|
    string invoiceId;
    string customer;
    int amount;
|};

final http:Client apiClient = check new ("https://httpbin.org", {
    timeout: 10
});

function validatePayment(Payment payment) returns Receipt|error {
    if payment.amount <= 0 {
        return error("invalid payment amount for invoice: " + payment.invoiceId);
    }
    return {
        invoiceId: payment.invoiceId,
        customer: payment.customer,
        amount: payment.amount
    };
}

public function main() returns error? {
    Payment[] payments = [
        {invoiceId: "INV-001", customer: "Asha", amount: 250, status: "paid"},
        {invoiceId: "INV-002", customer: "Ben", amount: 180, status: "pending"},
        {invoiceId: "INV-003", customer: "Chen", amount: 320, status: "paid"}
    ];

    Payment[] paidPayments = from var payment in payments
        where payment.status == "paid"
        select payment;

    Receipt[] receipts = [];
    foreach Payment payment in paidPayments {
        receipts.push(check validatePayment(payment));
    }

    http:Response response = check apiClient->post("/anything/payments/receipts", receipts);

    io:println("Status: ", response.statusCode);
    io:println("Receipts sent to the API:");
    foreach Receipt receipt in receipts {
        io:println("- ", receipt.invoiceId, " | ", receipt.customer, " | $", receipt.amount);
    }
}
