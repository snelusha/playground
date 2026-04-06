import ballerina/io;

function validateFahrenheit(int f) returns int|error {
    if f < -459 {
        return error("invalid fahrenheit: below absolute zero");
    }
    return f;
}

function toCelsius(int f) returns int|error {
    int valid = check validateFahrenheit(f);
    return ((valid - 32) * 5) / 9;
}

function averageCelsius(int f1, int f2) returns int|error {
    int c1 = check toCelsius(f1);
    int c2 = check toCelsius(f2);
    return (c1 + c2) / 2;
}

function externalCalibrator(int c) returns int {
    // Simulate a dependency that may panic for suspicious values.
    if c > 100 {
        panic error("calibrator overflow");
    }
    return c + 1;
}

function safeConvertedValue(int f) returns int|error {
    int c = check toCelsius(f);
    var calibrated = trap externalCalibrator(c);
    if calibrated is error {
        return calibrated;
    }
    return calibrated;
}

function leaf(int f1, int f2) {
    _ = checkpanic averageCelsius(f1, f2);
}

function middle(int f1, int f2) {
    leaf(f1, f2);
}

function top(int f1, int f2) {
    middle(f1, f2);
}

public function main() {
    io:println("=== Temperature Converter ===");
    io:println("Safe Convert | Input: 98F");
    io:println("Result | ", safeConvertedValue(98));
    io:println("\nSafe Convert | Input: -500F");
    io:println("Result | ", safeConvertedValue(-500));
    io:println("\nAverage | Inputs: 98F, 32F");
    io:println("Result | ", averageCelsius(98, 32));
    io:println("\nStack Trace | top(-500, 32)");

    top(-500, 32);
}

