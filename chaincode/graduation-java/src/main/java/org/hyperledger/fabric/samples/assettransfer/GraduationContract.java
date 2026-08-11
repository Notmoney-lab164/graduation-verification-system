package org.hyperledger.fabric.samples.assettransfer;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

import com.owlike.genson.Genson;
import org.hyperledger.fabric.contract.Context;
import org.hyperledger.fabric.contract.ContractInterface;
import org.hyperledger.fabric.contract.annotation.Contact;
import org.hyperledger.fabric.contract.annotation.Contract;
import org.hyperledger.fabric.contract.annotation.Default;
import org.hyperledger.fabric.contract.annotation.Info;
import org.hyperledger.fabric.contract.annotation.License;
import org.hyperledger.fabric.contract.annotation.Transaction;
import org.hyperledger.fabric.shim.ChaincodeException;
import org.hyperledger.fabric.shim.ChaincodeStub;
import org.hyperledger.fabric.shim.ledger.KeyValue;

@Contract(
        name = "graduation",
        info = @Info(
                title = "Graduation Verification Contract",
                description = "Store and verify public academic credentials",
                version = "2.5",
                license = @License(name = "Apache-2.0"),
                contact = @Contact(
                        email = "trienptse182026@fpt.edu.vn",
                        name = "FPT University"
                )
        )
)
@Default
// PUBLIC_ACADEMIC_CREDENTIAL_V2_4
public final class GraduationContract implements ContractInterface {

    private static final Genson genson = new Genson();
    private static final String AUTHORIZED_ISSUER_MSP = "Org1MSP";
    private static final String STUDENT_ID_PATTERN = "^[A-Z0-9]{3,20}$";
    private static final String METADATA_HASH_PATTERN = "^[a-fA-F0-9]{64}$";
    private static final String HASH_INDEX_PREFIX = "GRADUATION_HASH_";
    private static final String REJECTION_DECISION_PREFIX =
            "GRADUATION_REJECTION_";
    // EXTERNAL_REQUEST_FABRIC_DECISION_V1
    private static final String EXTERNAL_REJECTION_PREFIX =
            "EXTERNAL_REQUEST_REJECTION_";

    private enum GraduationErrors {
        STUDENT_ALREADY_EXISTS,
        STUDENT_NOT_FOUND,
        UNAUTHORIZED_ISSUER,
        INVALID_INPUT
    }

    /**
     * Writes the current official public academic credential.
     * CCCD, email, address and date of birth are deliberately excluded.
     */
    @Transaction(intent = Transaction.TYPE.SUBMIT)
    public Student syncStudentV2(
            final Context ctx,
            final String studentId,
            final String fullName,
            final String institutionCode,
            final String institutionName,
            final String facultyName,
            final String major,
            final String trainingMode,
            final String degreeId,
            final String degreeType,
            final String entranceYear,
            final String graduationStatus,
            final String graduationDate,
            final String graduationYear,
            final String classification,
            final String gpa,
            final String totalCredits,
            final String metadataHash) {

        assertAuthorizedIssuer(ctx);

        String normalizedStudentId = normalizeStudentId(studentId);
        String normalizedFullName = requirePublicValue(
                fullName,
                "fullName",
                100
        );
        String normalizedInstitutionCode = requirePublicValue(
                institutionCode,
                "institutionCode",
                50
        );
        String normalizedInstitutionName = requirePublicValue(
                institutionName,
                "institutionName",
                200
        );
        String normalizedFacultyName = requirePublicValue(
                facultyName,
                "facultyName",
                150
        );
        String normalizedMajor = requirePublicValue(major, "major", 150);
        String normalizedDegreeType = requirePublicValue(
                degreeType,
                "degreeType",
                50
        );
        String normalizedStatus = normalizeGraduationStatus(graduationStatus);
        String normalizedGpa = normalizeGpa(gpa);
        String normalizedMetadataHash = normalizeMetadataHash(metadataHash);

        Student oldStudent = studentExists(ctx, normalizedStudentId)
                ? queryStudent(ctx, normalizedStudentId)
                : null;
        ChaincodeStub stub = ctx.getStub();
        String now = stub.getTxTimestamp().toString();
        String txId = stub.getTxId();
        String issuerMsp = ctx.getClientIdentity().getMSPID();

        Student updatedStudent = new Student(
                normalizedStudentId,
                normalizedFullName,
                normalizedInstitutionCode,
                normalizedInstitutionName,
                normalizedFacultyName,
                normalizedMajor,
                optionalPublicValue(trainingMode, 50),
                optionalPublicValue(degreeId, 50),
                normalizedDegreeType,
                optionalPublicValue(entranceYear, 10),
                normalizedStatus,
                optionalPublicValue(graduationDate, 20),
                optionalPublicValue(graduationYear, 10),
                optionalPublicValue(classification, 50),
                normalizedGpa,
                optionalPublicValue(totalCredits, 10),
                normalizedMetadataHash,
                "v2",
                issuerMsp,
                txId,
                oldStudent == null ? now : oldStudent.getCreatedAt(),
                now
        );

        if (oldStudent != null
                && oldStudent.getMetadataHash() != null
                && !normalizedMetadataHash.equals(oldStudent.getMetadataHash())) {
            stub.delState(metadataHashIndexKey(oldStudent.getMetadataHash()));
        }

        stub.putState(
                updatedStudent.getStudentId(),
                genson.serialize(updatedStudent).getBytes(StandardCharsets.UTF_8)
        );
        putMetadataHashIndex(
                stub,
                normalizedMetadataHash,
                updatedStudent.getStudentId()
        );
        return updatedStudent;
    }

    @Transaction(intent = Transaction.TYPE.SUBMIT)
    public String recordStudentRejectionV2(
            final Context ctx,
            final String studentId,
            final String metadataHash) {

        assertAuthorizedIssuer(ctx);
        String normalizedStudentId = normalizeStudentId(studentId);
        String normalizedMetadataHash = normalizeMetadataHash(metadataHash);

        if (studentExists(ctx, normalizedStudentId)) {
            throw new ChaincodeException(
                    "Cannot reject an existing official graduation record: "
                            + normalizedStudentId,
                    GraduationErrors.STUDENT_ALREADY_EXISTS.toString()
            );
        }

        ChaincodeStub stub = ctx.getStub();
        String txId = stub.getTxId();
        String now = stub.getTxTimestamp().toString();
        String issuerMsp = ctx.getClientIdentity().getMSPID();

        Map<String, String> decision = new LinkedHashMap<>();
        decision.put("recordType", "GRADUATION_REJECTION");
        decision.put("decision", "REJECTED");
        decision.put("studentId", normalizedStudentId);
        decision.put("metadataHash", normalizedMetadataHash);
        decision.put("hashVersion", "v2");
        decision.put("issuerMsp", issuerMsp);
        decision.put("transactionId", txId);
        decision.put("createdAt", now);

        stub.putState(
                rejectionDecisionKey(txId),
                genson.serialize(decision).getBytes(StandardCharsets.UTF_8)
        );
        return genson.serialize(decision);
    }

    /**
     * Records the rejection of an imported CSV/XLSX request.
     * Only the student reference and the SHA-256 source hash are public.
     * The original row and the detailed rejection reason stay off-chain.
     */
    @Transaction(intent = Transaction.TYPE.SUBMIT)
    public String recordExternalStudentRejectionV1(
            final Context ctx,
            final String studentId,
            final String sourceDataHash) {

        assertAuthorizedIssuer(ctx);
        String normalizedStudentId = requirePublicValue(
                studentId,
                "studentId",
                20
        ).toUpperCase();
        String normalizedSourceHash = normalizeMetadataHash(sourceDataHash);

        ChaincodeStub stub = ctx.getStub();
        String txId = stub.getTxId();
        String now = stub.getTxTimestamp().toString();
        String issuerMsp = ctx.getClientIdentity().getMSPID();

        Map<String, String> decision = new LinkedHashMap<>();
        decision.put("recordType", "EXTERNAL_REQUEST_REJECTION");
        decision.put("decision", "REJECTED");
        decision.put("studentId", normalizedStudentId);
        decision.put("sourceDataHash", normalizedSourceHash);
        decision.put("hashVersion", "external-source-v1");
        decision.put("issuerMsp", issuerMsp);
        decision.put("transactionId", txId);
        decision.put("createdAt", now);

        stub.putState(
                EXTERNAL_REJECTION_PREFIX + txId,
                genson.serialize(decision).getBytes(StandardCharsets.UTF_8)
        );
        return genson.serialize(decision);
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public Student queryStudent(final Context ctx, final String studentId) {
        String normalizedStudentId = normalizeStudentId(studentId);
        byte[] studentBytes = ctx.getStub().getState(normalizedStudentId);

        if (studentBytes == null || studentBytes.length == 0) {
            throw new ChaincodeException(
                    "Student does not exist: " + normalizedStudentId,
                    GraduationErrors.STUDENT_NOT_FOUND.toString()
            );
        }

        return genson.deserialize(
                new String(studentBytes, StandardCharsets.UTF_8),
                Student.class
        );
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public Student readStudent(final Context ctx, final String studentId) {
        return queryStudent(ctx, studentId);
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public Student queryStudentByMetadataHash(
            final Context ctx,
            final String metadataHash) {

        ChaincodeStub stub = ctx.getStub();
        byte[] studentIdBytes = stub.getState(metadataHashIndexKey(metadataHash));

        if (studentIdBytes == null || studentIdBytes.length == 0) {
            throw new ChaincodeException(
                    "No current graduation record matches the supplied hash",
                    GraduationErrors.STUDENT_NOT_FOUND.toString()
            );
        }

        return queryStudent(
                ctx,
                new String(studentIdBytes, StandardCharsets.UTF_8)
        );
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public boolean studentExists(final Context ctx, final String studentId) {
        byte[] studentBytes = ctx.getStub().getState(
                normalizeStudentId(studentId)
        );
        return studentBytes != null && studentBytes.length > 0;
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public String verifyGraduation(
            final Context ctx,
            final String studentId,
            final String metadataHashFromBackend) {

        Student student = queryStudent(ctx, studentId);
        String status = student.getMetadataHash().equals(metadataHashFromBackend)
                ? "Verified"
                : "Mismatch";

        Map<String, String> result = new LinkedHashMap<>();
        result.put("studentId", student.getStudentId());
        result.put("fullName", student.getFullName());
        result.put("institutionCode", student.getInstitutionCode());
        result.put("institutionName", student.getInstitutionName());
        result.put("facultyName", student.getFacultyName());
        result.put("major", student.getMajor());
        result.put("trainingMode", student.getTrainingMode());
        result.put("degreeId", student.getDegreeId());
        result.put("degreeType", student.getDegreeType());
        result.put("entranceYear", student.getEntranceYear());
        result.put("graduationStatus", student.getGraduationStatus());
        result.put("graduationDate", student.getGraduationDate());
        result.put("graduationYear", student.getGraduationYear());
        result.put("classification", student.getClassification());
        result.put("gpa", student.getGpa());
        result.put("totalCredits", student.getTotalCredits());
        result.put("verificationStatus", status);
        result.put("metadataHashBlockchain", student.getMetadataHash());
        result.put("metadataHashBackend", metadataHashFromBackend);
        result.put("hashVersion", student.getHashVersion());
        result.put("transactionId", student.getTransactionId());
        return genson.serialize(result);
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public int countStudents(final Context ctx) {
        int count = 0;
        for (KeyValue entry : ctx.getStub().getStateByRange("", "")) {
            if (entry.getKey().matches(STUDENT_ID_PATTERN)) {
                count++;
            }
        }
        return count;
    }

    @Transaction(intent = Transaction.TYPE.SUBMIT)
    public int rebuildMetadataHashIndex(final Context ctx) {
        assertAuthorizedIssuer(ctx);
        ChaincodeStub stub = ctx.getStub();
        int indexedCount = 0;

        for (KeyValue entry : stub.getStateByRange("", "")) {
            if (!entry.getKey().matches(STUDENT_ID_PATTERN)) {
                continue;
            }

            Student student = genson.deserialize(
                    new String(entry.getValue(), StandardCharsets.UTF_8),
                    Student.class
            );
            if (student.getMetadataHash() != null
                    && student.getMetadataHash().matches(METADATA_HASH_PATTERN)) {
                putMetadataHashIndex(
                        stub,
                        student.getMetadataHash(),
                        student.getStudentId()
                );
                indexedCount++;
            }
        }
        return indexedCount;
    }

    private void putMetadataHashIndex(
            final ChaincodeStub stub,
            final String metadataHash,
            final String studentId) {

        stub.putState(
                metadataHashIndexKey(metadataHash),
                studentId.getBytes(StandardCharsets.UTF_8)
        );
    }

    private String metadataHashIndexKey(final String metadataHash) {
        return HASH_INDEX_PREFIX + normalizeMetadataHash(metadataHash);
    }

    private String rejectionDecisionKey(final String transactionId) {
        return REJECTION_DECISION_PREFIX + transactionId;
    }

    private void assertAuthorizedIssuer(final Context ctx) {
        String clientMsp = ctx.getClientIdentity().getMSPID();
        if (!AUTHORIZED_ISSUER_MSP.equals(clientMsp)) {
            throw new ChaincodeException(
                    "Only authorized issuer can write graduation records",
                    GraduationErrors.UNAUTHORIZED_ISSUER.toString()
            );
        }
    }

    private String normalizeStudentId(final String studentId) {
        if (studentId == null || studentId.trim().isEmpty()) {
            throw invalidInput("studentId is required");
        }

        String normalizedStudentId = studentId.trim().toUpperCase();
        if (!normalizedStudentId.matches(STUDENT_ID_PATTERN)) {
            throw invalidInput("Invalid studentId format");
        }
        return normalizedStudentId;
    }

    private String normalizeGraduationStatus(final String value) {
        return requirePublicValue(value, "graduationStatus", 30);
    }

    private String normalizeGpa(final String gpa) {
        if (gpa == null || gpa.trim().isEmpty()) {
            throw invalidInput("gpa is required");
        }

        try {
            return new BigDecimal(gpa.trim())
                    .setScale(2, RoundingMode.HALF_UP)
                    .toPlainString();
        } catch (NumberFormatException error) {
            throw invalidInput("Invalid GPA");
        }
    }

    private String normalizeMetadataHash(final String metadataHash) {
        if (metadataHash == null
                || !metadataHash.matches(METADATA_HASH_PATTERN)) {
            throw invalidInput(
                    "metadataHash must be a SHA-256 hexadecimal value"
            );
        }
        return metadataHash.toLowerCase();
    }

    private String requirePublicValue(
            final String value,
            final String fieldName,
            final int maxLength) {

        String normalized = optionalPublicValue(value, maxLength);
        if (normalized.isEmpty()) {
            throw invalidInput(fieldName + " is required");
        }
        return normalized;
    }

    private String optionalPublicValue(
            final String value,
            final int maxLength) {

        String normalized = value == null ? "" : value.trim();
        if (normalized.length() > maxLength) {
            throw invalidInput("Public credential value is too long");
        }
        return normalized;
    }

    private ChaincodeException invalidInput(final String message) {
        return new ChaincodeException(
                message,
                GraduationErrors.INVALID_INPUT.toString()
        );
    }
}
