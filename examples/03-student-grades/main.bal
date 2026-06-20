import ballerina/http;
import ballerina/io;

type Student record {|
    int id;
    string name;
    int mark;
|};

type GradeReport record {|
    string name;
    string grade;
|};

final http:Client apiClient = check new ("https://httpbin.org", {
    timeout: 10
});

function gradeFor(int mark) returns string|error {
    if mark < 0 || mark > 100 {
        return error("invalid mark");
    }
    if mark >= 75 {
        return "A";
    }
    if mark >= 60 {
        return "B";
    }
    return "C";
}

public function main() returns error? {
    Student[] students = [
        {id: 1, name: "Asha", mark: 82},
        {id: 2, name: "Ben", mark: 58},
        {id: 3, name: "Chen", mark: 91}
    ];

    GradeReport[] reports = [];
    foreach Student student in students {
        reports.push({
            name: student.name,
            grade: check gradeFor(student.mark)
        });
    }

    GradeReport[] topReports = from var report in reports
        where report.grade == "A"
        select report;

    http:Response response = check apiClient->post("/anything/students/top-grades", topReports);

    io:println("Status: ", response.statusCode);
    io:println("Top grade reports sent to the API:");
    foreach GradeReport report in topReports {
        io:println("- ", report.name, " | grade: ", report.grade);
    }
}
