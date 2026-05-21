package org.hyperledger.fabric.samples.assettransfer;

import com.owlike.genson.annotation.JsonCreator;
import com.owlike.genson.annotation.JsonProperty;
import org.hyperledger.fabric.contract.annotation.DataType;
import org.hyperledger.fabric.contract.annotation.Property;

@DataType()
public final class Student {
    @Property()
    private final String studentId;

    @Property()
    private final String fullName;

    @Property()
    private final String major;

    @Property()
    private final String graduationStatus;

    @Property()
    private final String graduationDate;

    @JsonCreator
    public Student(
            @JsonProperty("studentId") final String studentId,
            @JsonProperty("fullName") final String fullName,
            @JsonProperty("major") final String major,
            @JsonProperty("graduationStatus") final String graduationStatus,
            @JsonProperty("graduationDate") final String graduationDate) {
        this.studentId = studentId;
        this.fullName = fullName;
        this.major = major;
        this.graduationStatus = graduationStatus;
        this.graduationDate = graduationDate;
    }

    public String getStudentId() {
        return studentId;
    }

    public String getFullName() {
        return fullName;
    }

    public String getMajor() {
        return major;
    }

    public String getGraduationStatus() {
        return graduationStatus;
    }

    public String getGraduationDate() {
        return graduationDate;
    }
}
