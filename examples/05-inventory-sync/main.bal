import ballerina/http;
import ballerina/io;

type Product record {|
    string sku;
    string name;
    int quantity;
    int reorderLevel;
|};

type RestockRequest record {|
    string sku;
    string name;
    int requiredQuantity;
|};

final http:Client apiClient = check new ("https://httpbin.org", {
    timeout: 10
});

function requiredQuantity(Product product) returns int|error {
    if product.quantity < 0 {
        return error("invalid stock count for SKU: " + product.sku);
    }
    return product.reorderLevel - product.quantity;
}

public function main() returns error? {
    Product[] products = [
        {sku: "ITM-100", name: "Laptop Stand", quantity: 4, reorderLevel: 10},
        {sku: "ITM-101", name: "Keyboard", quantity: 25, reorderLevel: 10},
        {sku: "ITM-102", name: "USB-C Cable", quantity: 2, reorderLevel: 20}
    ];

    Product[] lowStockProducts = from var product in products
        where product.quantity < product.reorderLevel
        select product;

    RestockRequest[] requests = [];
    foreach Product product in lowStockProducts {
        requests.push({
            sku: product.sku,
            name: product.name,
            requiredQuantity: check requiredQuantity(product)
        });
    }

    http:Response response = check apiClient->post("/anything/inventory/restock", requests);

    io:println("Status: ", response.statusCode);
    io:println("Restock requests sent to the API:");
    foreach RestockRequest request in requests {
        io:println("- ", request.sku, " | ", request.name, " | qty: ", request.requiredQuantity);
    }
}
