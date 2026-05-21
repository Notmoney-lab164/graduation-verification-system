package org.hyperledger.fabric.samples.assettransfer;

import com.owlike.genson.Genson;
import org.hyperledger.fabric.contract.Context;
import org.hyperledger.fabric.contract.ContractInterface;
import org.hyperledger.fabric.contract.annotation.Contract;
import org.hyperledger.fabric.contract.annotation.Default;
import org.hyperledger.fabric.contract.annotation.Transaction;
import org.hyperledger.fabric.shim.ChaincodeException;
import org.hyperledger.fabric.shim.ChaincodeStub;

@Contract(name = "graduation")
@Default
public final class GraduationContract implements ContractInterface {
    private final Genson genson = new Genson();

    private enum GraduationErrors {
        STUDENT_NOT_FOUND,
        STUDENT_ALREADY_EXISTS
    }

    @Transaction(intent = Transaction.TYPE.SUBMIT)
    public Student createStudent(
            final Context ctx,
            final String studentId,
            final String fullName,
            final String major,
            final String graduationStatus,
            final String graduationDate) {
        ChaincodeStub stub = ctx.getStub();

        if (studentExists(ctx, studentId)) {
            throw new ChaincodeException(
                    "Student " + studentId + " already exists",
                    GraduationErrors.STUDENT_ALREADY_EXISTS.toString());
        }

        Student student = new Student(studentId, fullName, major, graduationStatus, graduationDate);
        String studentJson = genson.serialize(student);
        stub.putStringState(studentId, studentJson);

        return student;
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public Student queryStudent(final Context ctx, final String studentId) {
        ChaincodeStub stub = ctx.getStub();
        String studentJson = stub.getStringState(studentId);

        if (studentJson == null || studentJson.isEmpty()) {
            throw new ChaincodeException(
                    "Student " + studentId + " does not exist",
                    GraduationErrors.STUDENT_NOT_FOUND.toString());
        }

        return genson.deserialize(studentJson, Student.class);
    }

    @Transaction(intent = Transaction.TYPE.SUBMIT)
    public Student updateGraduationStatus(
            final Context ctx,
            final String studentId,
            final String graduationStatus,
            final String graduationDate) {
        Student oldStudent = queryStudent(ctx, studentId);

        Student updatedStudent = new Student(
                oldStudent.getStudentId(),
                oldStudent.getFullName(),
                oldStudent.getMajor(),
                graduationStatus,
                graduationDate);

        String studentJson = genson.serialize(updatedStudent);
        ctx.getStub().putStringState(studentId, studentJson);

        return updatedStudent;
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public String verifyGraduation(final Context ctx, final String studentId) {
        Student student = queryStudent(ctx, studentId);
        return student.getGraduationStatus();
    }

    @Transaction(intent = Transaction.TYPE.EVALUATE)
    public boolean studentExists(final Context ctx, final String studentId) {
        String studentJson = ctx.getStub().getStringState(studentId);
        return studentJson != null && !studentJson.isEmpty();
    }
}
