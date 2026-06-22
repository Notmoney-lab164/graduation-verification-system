package org.hyperledger.fabric.samples.assettransfer;

import com.owlike.genson.annotation.JsonProperty;
import org.hyperledger.fabric.contract.annotation.DataType;
import org.hyperledger.fabric.contract.annotation.Property;

@DataType()
public final class Student {

    @Property()
    private final String studentId;

    @Property()
    private final String gpa;

    @Property()
    private final String graduationStatus;

    @Property()
    private final String metadataHash;

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
            @JsonProperty("gpa") final String gpa,
            @JsonProperty("graduationStatus") final String graduationStatus,
            @JsonProperty("metadataHash") final String metadataHash,
            @JsonProperty("issuerMsp") final String issuerMsp,
            @JsonProperty("transactionId") final String transactionId,
            @JsonProperty("createdAt") final String createdAt,
            @JsonProperty("updatedAt") final String updatedAt) {

        this.studentId = studentId;
        this.gpa = gpa;
        this.graduationStatus = graduationStatus;
        this.metadataHash = metadataHash;
        this.issuerMsp = issuerMsp;
        this.transactionId = transactionId;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public String getStudentId() {
        return studentId;
    }

    public String getGpa() {
        return gpa;
    }

    public String getGraduationStatus() {
        return graduationStatus;
    }

    public String getMetadataHash() {
        return metadataHash;
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