from triage import rubric


def test_constants_are_integers_and_positive():
    assert isinstance(rubric.STUB_REBUILD_THRESHOLD, int) and rubric.STUB_REBUILD_THRESHOLD > 0
    assert isinstance(rubric.MIN_TESTS_FOR_VALIDATED, int) and rubric.MIN_TESTS_FOR_VALIDATED > 0
    assert isinstance(rubric.STALE_DAYS, int) and rubric.STALE_DAYS > 0
    assert isinstance(rubric.MIN_VALIDATED_SIZE_KB, (int, float)) and rubric.MIN_VALIDATED_SIZE_KB > 0


def test_constants_match_spec():
    assert rubric.STUB_REBUILD_THRESHOLD == 6
    assert rubric.MIN_TESTS_FOR_VALIDATED == 3
    assert rubric.STALE_DAYS == 365
    assert rubric.MIN_VALIDATED_SIZE_KB == 10
