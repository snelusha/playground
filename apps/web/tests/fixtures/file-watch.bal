import ballerina/file;
import ballerina/io;
import ballerina/lang.runtime;

string watchDir = checkpanic file:createTempDir(prefix = "watch-");
string watchedFile = checkpanic file:joinPath(watchDir, "sample.txt");
listener file:Listener dirListener = checkpanic new ({path: watchDir});

isolated boolean createInvoked = false;
isolated boolean modifyInvoked = false;
isolated boolean deleteInvoked = false;

service on dirListener {
    remote function onCreate(file:FileEvent event) {
        lock {
            createInvoked = event.operation == "create" && event.name == watchedFile;
        }
    }

    remote function onModify(file:FileEvent event) {
        lock {
            modifyInvoked = event.operation == "modify" && event.name == watchedFile;
        }
    }

    remote function onDelete(file:FileEvent event) {
        lock {
            deleteInvoked = event.operation == "delete" && event.name == watchedFile;
        }
    }
}

public function main() returns error? {
    check dirListener.'start();
    check file:create(watchedFile);
    runtime:sleep(0.05);
    check io:fileWriteString(watchedFile, "content");
    runtime:sleep(0.05);
    check file:remove(watchedFile);
    runtime:sleep(0.05);

    boolean created;
    lock {
        created = createInvoked;
    }
    boolean modified;
    lock {
        modified = modifyInvoked;
    }
    boolean deleted;
    lock {
        deleted = deleteInvoked;
    }
    io:println(created && modified && deleted);
}
