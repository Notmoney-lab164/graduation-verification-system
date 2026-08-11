package org.hyperledger.fabric.samples.assettransfer;

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
    private final String institutionCode;

    @Property()
    private final String institutionName;

    @Property()
    private final String facultyName;

    @Property()
    private final String major;

    @Property()
    private final String trainingMode;

    @Property()
    private final String degreeId;

    @Property()
    private final String degreeType;

    @Property()
    private final String entranceYear;

    @Property()
    private final String graduationStatus;

    @Property()
    private final String graduationDate;

    @Property()
    private final String graduationYear;

    @Property()
    private final String classification;

    @Property()
    private final String gpa;

    @Property()
    private final String totalCredits;

    @Property()
    private final String metadataHash;

    @Property()
    private final String hashVersion;

    @Property()
    private final String issuerMsp;

    @Property()
    private final String transactionId;

    @Property()
    private final String createdAt;

    @Property()
    private final String updatedAt;

    public Student(
            @JsonProperty("studentId") final String studentId,
            @JsonProperty("fullName") final String fullName,
            @JsonProperty("institutionCode") final String institutionCode,
            @JsonProperty("institutionName") final String institutionName,
            @JsonProperty("facultyName") final String facultyName,
            @JsonProperty("major") final String major,
            @JsonProperty("trainingMode") final String trainingMode,
            @JsonProperty("degreeId") final String degreeId,
            @JsonProperty("degreeType") final String degreeType,
            @JsonProperty("entranceYear") final String entranceYear,
            @JsonProperty("graduationStatus") final String graduationStatus,
            @JsonProperty("graduationDate") final String graduationDate,
            @JsonProperty("graduationYear") final String graduationYear,
            @JsonProperty("classification") final String classification,
            @JsonProperty("gpa") final String gpa,
            @JsonProperty("totalCredits") final String totalCredits,
            @JsonProperty("metadataHash") final String metadataHash,
            @JsonProperty("hashVersion") final String hashVersion,
            @JsonProperty("issuerMsp") final String issuerMsp,
            @JsonProperty("transactionId") final String transactionId,
            @JsonProperty("createdAt") final String createdAt,
            @JsonProperty("updatedAt") final String updatedAt) {

        this.studentId = studentId;
        this.fullName = fullName;
        this.institutionCode = institutionCode;
        this.institutionName = institutionName;
        this.facultyName = facultyName;
        this.major = major;
        this.trainingMode = trainingMode;
        this.degreeId = degreeId;
        this.degreeType = degreeType;
        this.entranceYear = entranceYear;
        this.graduationStatus = graduationStatus;
        this.graduationDate = graduationDate;
        this.graduationYear = graduationYear;
        this.classification = classification;
        this.gpa = gpa;
        this.totalCredits = totalCredits;
        this.metadataHash = metadataHash;
        this.hashVersion = hashVersion == null || hashVersion.trim().isEmpty()
                ? "v2"
                : hashVersion;
        this.issuerMsp = issuerMsp;
        this.transactionId = transactionId;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public String getStudentId() {
        return studentId;
    }

    public String getFullName() {
        return fullName;
    }

    public String getInstitutionCode() {
        return institutionCode;
    }

    public String getInstitutionName() {
        return institutionName;
    }

    public String getFacultyName() {
        return facultyName;
    }

    public String getMajor() {
        return major;
    }

    public String getTrainingMode() {
        return trainingMode;
    }

    public String getDegreeId() {
        return degreeId;
    }

    public String getDegreeType() {
        return degreeType;
    }

    public String getEntranceYear() {
        return entranceYear;
    }

    public String getGraduationStatus() {
        return graduationStatus;
    }

    public String getGraduationDate() {
        return graduationDate;
    }

    public String getGraduationYear() {
        return graduationYear;
    }

    public String getClassification() {
        return classification;
    }

    public String getGpa() {
        return gpa;
    }

    public String getTotalCredits() {
        return totalCredits;
    }

    public String getMetadataHash() {
        return metadataHash;
    }

    public String getHashVersion() {
        return hashVersion;
    }

    public String getIssuerMsp() {
        return issuerMsp;
    }

    public String getTransactionId() {
        return transactionId;
    }

    public String getCreatedAt() {
        return createdAt;
    }

    public String getUpdatedAt() {
        return updatedAt;
    }
}
