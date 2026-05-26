package org.hyperledger.fabric.samples.assettransfer;

import com.owlike.genson.Genson;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;
import org.hyperledger.fabric.contract.Context;
import org.hyperledger.fabric.contract.ContractInterface;
import org.hyperledger.fabric.contract.annotation.Contract;
import org.hyperledger.fabric.contract.annotation.Default;
import org.hyperledger.fabric.contract.annotation.Transaction;
import org.hyperledger.fabric.shim.ChaincodeException;
import org.hyperledger.fabric.shim.ChaincodeStub;
import org.hyperledger.fabric.shim.ledger.KeyValue;
import org.hyperledger.fabric.shim.ledger.QueryResultsIterator;

/**
 * Hợp đồng thông minh (Smart Contract) quản lý dữ liệu tốt nghiệp sinh viên
 * trên nền tảng Hyperledger Fabric.
 */
@Contract(name = "graduation")
@Default
public final class GraduationContract implements ContractInterface {

    private static final String AUTHORIZED_ISSUER_MSP = "Org1MSP";
    private final Genson genson = new Genson();

    private enum GraduationErrors {
        STUDENT_NOT_FOUND,
        STUDENT_ALREADY_EXISTS,
        UNAUTHORIZED_ORGANIZATION,
        INVALID_INPUT
    }

    // =========================================================
    // TRANSACTION — SUBMIT
    // =========================================================

    @Transaction(intent = Transaction.TYPE.SUBMIT)
    public Student createStudent(
            final Context ctx,
            final String studentId,
            final String fullName,
            final String dateOfBirth,
            final String citizenIdHash,
            final String institutionCode,
            final String institutionName,
            final String facultyName,
            final String major,
            final String degreeId,
            final String degreeType,
            final String graduationStatus,
            final String graduationDate,
            final String graduationYear,
            final String classification,
            final String gpa,
            final String totalCredits,
            final String entranceYear,
            final String issuerSignature) {
        requireAuthorizedIssuer(ctx);
        validateRequired(studentId, "studentId");
        validateRequired(citizenIdHash, "citizenIdHash");
        validateRequired(degreeId, "degreeId");
        validateRequired(issuerSignature, "issuerSignature");

        ChaincodeStub stub = ctx.getStub();

        if (studentExists(ctx, studentId)) {
            throw new ChaincodeException(
                    "Student " + studentId + " already exists",
                    GraduationErrors.STUDENT_ALREADY_EXISTS.toString());
        }

        String organizationMsp = ctx.getClientIdentity().getMSPID();
        String ledgerTimestamp = stub.getTxTimestamp().toString();

        String metadataHash = calculateMetadataHash(
                studentId, fullName, dateOfBirth, citizenIdHash,
                institutionCode, institutionName, facultyName, major,
                degreeId, degreeType, graduationStatus, graduationDate,
                graduationYear, classification, gpa, totalCredits, entranceYear);

        Student student = new Student(
                studentId, fullName, dateOfBirth, citizenIdHash,
                institutionCode, institutionName, facultyName, major,
                degreeId, degreeType, graduationStatus, graduationDate,
                graduationYear, classification, gpa, totalCredits, entranceYear,
                metadataHash, issuerSignature, organizationMsp,
                ledgerTimestamp, ledgerTimestamp, ledgerTimestamp);

        stub.putStringState(studentId, genson.serialize(student));
        return student;
    }

    @Transaction(intent = Transaction.TYPE.SUBMIT)
    public Student updateGraduationStatus(
            final Context ctx,
            final String studentId,
            final String graduationStatus,
            final String graduationDate,
            final String graduationYear,
            final String classification,
            final String gpa,
            final String totalCredits,
            final String issuerSignature) {
        requireAuthorizedIssuer(ctx);
        validateRequired(studentId, "studentId");
        validateRequired(issuerSignature, "issuerSignature");

        Student oldStudent = queryStudent(ctx, studentId);
        String ledgerTimestamp = ctx.getStub().getTxTimestamp().toString();
        String organizationMsp = ctx.getClientIdentity().getMSPID();

        String metadataHash = calculateMetadataHash(
                oldStudent.getStudentId(), oldStudent.getFullName(),
                oldStudent.getDateOfBirth(), oldStudent.getCitizenIdHash(),
                oldStudent.getInstitutionCode(), oldStudent.getInstitutionName(),
                oldStudent.getFacultyName(), oldStudent.getMajor(),
                oldStudent.getDegreeId(), oldStudent.getDegreeType(),
                graduationStatus, graduationDate, graduationYear,
                classification, gpa, totalCredits, oldStudent.getEntranceYear());

        Student updatedStudent = new Student(
                oldStudent.getStudentId(), oldStudent.getFullName(),
                oldStudent.getDateOfBirth(), oldStudent.getCitizenIdHash(),
                oldStudent.getInstitutionCode(), oldStudent.getInstitutionName(),
                oldStudent.getFacultyName(), oldStudent.getMajor(),
                oldStudent.getDegreeId(), oldStudent.getDegreeType(),
                graduationStatus, graduationDate, graduationYear,
                classification, gpa, totalCredits, oldStudent.getEntranceYear(),
                metadataHash, issuerSignature, organizationMsp,
                ledgerTimestamp, oldStudent.getCreatedAt(), ledgerTimestamp);

        ctx.getStub().putStringState(studentId, genson.serialize(updatedStudent));
        return updatedStudent;
    }

    // =========================================================
    // TRANSACTION — EVALUATE
    // =========================================================

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public Student queryStudent(final Context ctx, final String studentId) {
        String studentJson = ctx.getStub().getStringState(studentId);

        if (studentJson == null || studentJson.isEmpty()) {
            throw new ChaincodeException(
                    "Student " + studentId + " does not exist",
                    GraduationErrors.STUDENT_NOT_FOUND.toString());
        }

        return genson.deserialize(studentJson, Student.class);
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public String verifyGraduation(final Context ctx, final String studentId) {
        Student student = queryStudent(ctx, studentId);
        return student.getGraduationStatus();
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public boolean verifyStudentIntegrity(final Context ctx, final String studentId) {
        Student student = queryStudent(ctx, studentId);

        String recalculatedHash = calculateMetadataHash(
                student.getStudentId(), student.getFullName(),
                student.getDateOfBirth(), student.getCitizenIdHash(),
                student.getInstitutionCode(), student.getInstitutionName(),
                student.getFacultyName(), student.getMajor(),
                student.getDegreeId(), student.getDegreeType(),
                student.getGraduationStatus(), student.getGraduationDate(),
                student.getGraduationYear(), student.getClassification(),
                student.getGpa(), student.getTotalCredits(),
                student.getEntranceYear());

        return recalculatedHash.equals(student.getMetadataHash());
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public boolean studentExists(final Context ctx, final String studentId) {
        String studentJson = ctx.getStub().getStringState(studentId);
        return studentJson != null && !studentJson.isEmpty();
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public int countStudents(final Context ctx) {
        return listStudentIds(ctx).length;
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public String[] listStudentIds(final Context ctx) {
        ChaincodeStub stub = ctx.getStub();
        List<String> ids = new ArrayList<>();

        try (QueryResultsIterator<KeyValue> results = stub.getStateByRange("", "")) {
            for (KeyValue kv : results) {
                String key = kv.getKey();
                String value = kv.getStringValue();
                if (value == null || value.isEmpty()) {
                    continue;
                }
                try {
                    genson.deserialize(value, Student.class);
                    ids.add(key);
                } catch (Exception ignored) {
                    // key không phải Student
                }
            }
        } catch (Exception e) {
            throw new ChaincodeException(
                    "Failed to list students: " + e.getMessage(),
                    GraduationErrors.INVALID_INPUT.toString());
        }

        return ids.toArray(new String[0]);
    }

    // =========================================================
    // PRIVATE HELPERS
    // =========================================================

    private void requireAuthorizedIssuer(final Context ctx) {
        String mspId = ctx.getClientIdentity().getMSPID();
        if (!AUTHORIZED_ISSUER_MSP.equals(mspId)) {
            throw new ChaincodeException(
                    "Only " + AUTHORIZED_ISSUER_MSP + " can write graduation records",
                    GraduationErrors.UNAUTHORIZED_ORGANIZATION.toString());
        }
    }

    private void validateRequired(final String value, final String fieldName) {
        if (value == null || value.trim().isEmpty()) {
            throw new ChaincodeException(
                    fieldName + " is required",
                    GraduationErrors.INVALID_INPUT.toString());
        }
    }

    private String calculateMetadataHash(final String... values) {
        StringBuilder builder = new StringBuilder();
        for (String value : values) {
            builder.append(value == null ? "" : value.trim()).append("|");
        }
        return sha256(builder.toString());
    }

    private String sha256(final String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] encodedHash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte hashByte : encodedHash) {
                String hex = Integer.toHexString(0xff & hashByte);
                if (hex.length() == 1) {
                    hexString.append('0');
                }
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new ChaincodeException(
                    exception.getMessage(),
                    GraduationErrors.INVALID_INPUT.toString());
        }
    }
}
