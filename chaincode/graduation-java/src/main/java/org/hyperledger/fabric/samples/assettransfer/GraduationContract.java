package org.hyperledger.fabric.samples.assettransfer;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
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
                description = "Store and verify graduation metadata hash",
                version = "1.0",
                license = @License(name = "Apache-2.0"),
                contact = @Contact(email = "admin@fpt.edu.vn", name = "FPT University")
        )
)
@Default
public final class GraduationContract implements ContractInterface {

    private static final Genson genson = new Genson();

    // MSP ID cua to chuc trong Hyperledger Fabric, khong phai ten truong.
    private static final String AUTHORIZED_ISSUER_MSP = "Org1MSP";

    private enum GraduationErrors {
        STUDENT_ALREADY_EXISTS,
        STUDENT_NOT_FOUND,
        UNAUTHORIZED_ISSUER,
        INVALID_INPUT
    }

    @Transaction(intent = Transaction.TYPE.SUBMIT)
    public Student createStudent(
            final Context ctx,
            final String studentId,
            final String gpa,
            final String graduationStatus) {

        assertAuthorizedIssuer(ctx);
        validateInput(studentId, gpa, graduationStatus);

        if (studentExists(ctx, studentId)) {
            throw new ChaincodeException(
                    "Student already exists: " + studentId,
                    GraduationErrors.STUDENT_ALREADY_EXISTS.toString()
            );
        }

        String normalizedGpa = normalizeGpa(gpa);
        String normalizedStatus = graduationStatus.trim();
        String metadataHash = calculateMetadataHash(studentId, normalizedGpa, normalizedStatus);

        ChaincodeStub stub = ctx.getStub();
        String now = stub.getTxTimestamp().toString();
        String txId = stub.getTxId();
        String issuerMsp = ctx.getClientIdentity().getMSPID();

        Student student = new Student(
                studentId.trim(),
                normalizedGpa,
                normalizedStatus,
                metadataHash,
                issuerMsp,
                txId,
                now,
                now
        );

        stub.putState(student.getStudentId(), genson.serialize(student).getBytes(StandardCharsets.UTF_8));

        return student;
    }

    @Transaction(intent = Transaction.TYPE.SUBMIT)
    public Student updateStudent(
            final Context ctx,
            final String studentId,
            final String gpa,
            final String graduationStatus) {

        assertAuthorizedIssuer(ctx);
        validateInput(studentId, gpa, graduationStatus);

        Student oldStudent = queryStudent(ctx, studentId);

        String normalizedGpa = normalizeGpa(gpa);
        String normalizedStatus = graduationStatus.trim();
        String metadataHash = calculateMetadataHash(studentId, normalizedGpa, normalizedStatus);

        ChaincodeStub stub = ctx.getStub();
        String now = stub.getTxTimestamp().toString();
        String txId = stub.getTxId();
        String issuerMsp = ctx.getClientIdentity().getMSPID();

        Student updatedStudent = new Student(
                oldStudent.getStudentId(),
                normalizedGpa,
                normalizedStatus,
                metadataHash,
                issuerMsp,
                txId,
                oldStudent.getCreatedAt(),
                now
        );

        stub.putState(updatedStudent.getStudentId(), genson.serialize(updatedStudent).getBytes(StandardCharsets.UTF_8));

        return updatedStudent;
    }

    @Transaction(intent = Transaction.TYPE.SUBMIT)
    public Student syncStudent(
            final Context ctx,
            final String studentId,
            final String gpa,
            final String graduationStatus) {

        if (studentExists(ctx, studentId)) {
            return updateStudent(ctx, studentId, gpa, graduationStatus);
        }

        return createStudent(ctx, studentId, gpa, graduationStatus);
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public Student queryStudent(final Context ctx, final String studentId) {
        ChaincodeStub stub = ctx.getStub();
        byte[] studentBytes = stub.getState(studentId);

        if (studentBytes == null || studentBytes.length == 0) {
            throw new ChaincodeException(
                    "Student does not exist: " + studentId,
                    GraduationErrors.STUDENT_NOT_FOUND.toString()
            );
        }

        return genson.deserialize(new String(studentBytes, StandardCharsets.UTF_8), Student.class);
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public Student readStudent(final Context ctx, final String studentId) {
        return queryStudent(ctx, studentId);
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public boolean studentExists(final Context ctx, final String studentId) {
        ChaincodeStub stub = ctx.getStub();
        byte[] studentBytes = stub.getState(studentId);

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
        result.put("verificationStatus", status);
        result.put("graduationStatus", student.getGraduationStatus());
        result.put("gpa", student.getGpa());
        result.put("metadataHashBlockchain", student.getMetadataHash());
        result.put("metadataHashBackend", metadataHashFromBackend);
        result.put("transactionId", student.getTransactionId());

        return genson.serialize(result);
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public int countStudents(final Context ctx) {
        int count = 0;

        for (KeyValue ignored : ctx.getStub().getStateByRange("", "")) {
            count++;
        }

        return count;
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

    private void validateInput(
            final String studentId,
            final String gpa,
            final String graduationStatus) {

        if (studentId == null || studentId.trim().isEmpty()) {
            throw new ChaincodeException("studentId is required", GraduationErrors.INVALID_INPUT.toString());
        }

        if (gpa == null || gpa.trim().isEmpty()) {
            throw new ChaincodeException("gpa is required", GraduationErrors.INVALID_INPUT.toString());
        }

        if (graduationStatus == null || graduationStatus.trim().isEmpty()) {
            throw new ChaincodeException("graduationStatus is required", GraduationErrors.INVALID_INPUT.toString());
        }
    }

    private String normalizeGpa(final String gpa) {
        try {
            return new BigDecimal(gpa.trim())
                    .setScale(2, RoundingMode.HALF_UP)
                    .toPlainString();
        } catch (NumberFormatException error) {
            throw new ChaincodeException("Invalid GPA", GraduationErrors.INVALID_INPUT.toString());
        }
    }

    private String calculateMetadataHash(
            final String studentId,
            final String gpa,
            final String graduationStatus) {

        String canonicalJson = "{"
                + "\"gpa\":\"" + escapeJson(gpa) + "\","
                + "\"graduation_status\":\"" + escapeJson(graduationStatus) + "\","
                + "\"student_id\":\"" + escapeJson(studentId.trim()) + "\""
                + "}";

        return sha256(canonicalJson);
    }

    private String sha256(final String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] encodedHash = digest.digest(value.getBytes(StandardCharsets.UTF_8));

            StringBuilder hexString = new StringBuilder();

            for (byte item : encodedHash) {
                String hex = Integer.toHexString(0xff & item);

                if (hex.length() == 1) {
                    hexString.append('0');
                }

                hexString.append(hex);
            }

            return hexString.toString();
        } catch (NoSuchAlgorithmException error) {
            throw new ChaincodeException("SHA-256 algorithm is not available");
        }
    }

    private String escapeJson(final String value) {
        return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"");
    }
}