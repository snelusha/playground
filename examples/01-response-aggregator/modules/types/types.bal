// API response record type definition.
public type ApiResponse record {|
    string ep;
    int status;
    int flags;
    any result;
|};

