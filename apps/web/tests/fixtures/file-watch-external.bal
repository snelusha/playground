import ballerina/file;
import ballerina/io;
import ballerina/lang.runtime;

string watchDir = "/tmp/watch-external";
string watchedFile = watchDir + "/editor.txt";
listener file:Listener dirListener = checkpanic new ({path: watchDir});

isolated boolean createInvoked = false;

service on dirListener {
    remote function onCreate(file:FileEvent event) {
        lock {
            createInvoked = event.operation == "create" && event.name == watchedFile;
        }
    }
}

public function main() returns error? {
    check dirListener.'start();
    io:println("ready");
    runtime:sleep(0.2);

    boolean invoked;
    lock {
        invoked = createInvoked;
    }
    io:println(invoked);
}
