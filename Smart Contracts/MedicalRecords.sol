//SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "./Registration.sol";

contract MedicalRecords {

    Registration immutable regSC;

    constructor (address regSCAddr) {
        regSC = Registration(regSCAddr);
    }

    modifier onlyRegisteredClinicians {
        require(regSC.isClinicianRegistered(msg.sender), "Only registered clinicians can call this function");
        _;
    }

    struct Test {
        address clinician;
        uint256 test;
        string result;
    }

    struct Visit {
        address clinician;
        string condition;
        string note;
    }

    struct PatientRecords {
        Test[] tests;
        string[] chronicDiseases;
        uint256[] surgeries;
        Visit[] visits;
    }

    mapping (address=>PatientRecords) patientRecords;

    function addChronicDisease(address patientAddress, string memory icd10Code) public onlyRegisteredClinicians {
        require(regSC.isPatientRegistered(patientAddress), "Patient is not registered");
        patientRecords[patientAddress].chronicDiseases.push(icd10Code);
    }

    function addSurgery(address patientAddress, uint256 cptCode) public onlyRegisteredClinicians{
        require(regSC.isPatientRegistered(patientAddress), "Patient is not registered");
        patientRecords[patientAddress].surgeries.push(cptCode);
    }

    function addTestResult(address patientAddress, uint256 testCPTCode, string memory result) public onlyRegisteredClinicians {
        require(regSC.isPatientRegistered(patientAddress), "Patient is not registered");
        patientRecords[patientAddress].tests.push(Test({
            clinician: msg.sender,
            test: testCPTCode,
            result: result
        }));
    }
    
    function addDoctorVisit(address patientAddress, string memory condition, string memory note) public onlyRegisteredClinicians {
        require(regSC.isPatientRegistered(patientAddress), "Patient is not registered");
        patientRecords[patientAddress].visits.push(Visit({
            clinician: msg.sender,
            condition: condition,
            note: note
        }));
    }

}
