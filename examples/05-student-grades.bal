import ballerina/io;

type Student record {|
    int id;
    string name;
    int grade;
|};

function findById(Student[] students, int studentId) returns Student|error {
    Student[] rows = from var s in students
        where s.id == studentId
        select s;

    if rows.length() == 0 {
        return error("student not found");
    }

    return rows[0];
}

function maxGrade(Student[] students) returns int {
    int best = students[0].grade;
    foreach Student s in students {
        if s.grade > best {
            best = s.grade;
        }
    }
    return best;
}

function averageGrade(Student[] students) returns int {
    int sum = 0;
    foreach Student s in students {
        sum += s.grade;
    }
    return sum / students.length();
}

function topStudents(Student[] students) returns Student[] {
    int best = maxGrade(students);
    Student[] rows = from var s in students
        where s.grade == best
        select s;
    return rows;
}

public function main() {
    Student[] students = [
        {id: 101, name: "Asha", grade: 78},
        {id: 102, name: "Nimal", grade: 92},
        {id: 103, name: "Ravi", grade: 85},
        {id: 104, name: "Sara", grade: 92}
    ];

    io:println("=== Student Grades ===");
    io:println("Average Grade | ", averageGrade(students));
    io:println("\nTop Students");
    Student[] tops = topStudents(students);
    foreach Student s in tops {
        io:println("- ", s.id, " | ", s.name, " | ", s.grade);
    }

    io:println("\nLookup | ID 102");
    var row1 = findById(students, 102);
    if row1 is Student {
        io:println("Found  | ", row1.id, " | ", row1.name, " | ", row1.grade);
    } else {
        io:println("Error  | ", row1);
    }

    io:println("\nLookup | ID 999");
    var row2 = findById(students, 999);
    if row2 is Student {
        io:println("Found  | ", row2.id, " | ", row2.name, " | ", row2.grade);
    } else {
        io:println("Error  | ", row2);
    }
}

